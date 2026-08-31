'use strict';

/**
 * FFmpeg process manager.
 *
 * - Starts a server-side FFmpeg process per stream (never the browser).
 * - Parses `-progress` output for real bitrate / fps / speed stats.
 * - Watchdog reconciles running streams every few seconds and automatically
 *   restarts FFmpeg with bounded backoff after transient failures.
 * - Streams persisted with status "running" are resumed after a server boot,
 *   so closing the browser or rebooting the service does not end a stream.
 */

const { spawn, spawnSync } = require('child_process');
const config = require('./config');

function resolveFfmpeg() {
  const candidates = [config.FFMPEG_PATH, 'ffmpeg', 'C:\\ffmpeg\\bin\\ffmpeg.exe'];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const res = spawnSync(candidate, ['-version'], { timeout: 8000, encoding: 'utf8' });
      if (res.status === 0 && res.stdout && /ffmpeg version/i.test(res.stdout)) {
        return candidate;
      }
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

function resizeTail(tail, max) {
  if (tail.length > max) tail.splice(0, tail.length - max);
}

class FfmpegManager {
  constructor(store) {
    this.store = store;
    this.ffmpegPath = null;
    this.entries = new Map(); // streamId -> running process info
    this.restartState = new Map(); // streamId -> { count, lastAt, error }
    this.findVideoFile = async () => null;
  }

  async init() {
    this.ffmpegPath = resolveFfmpeg();
    return !!this.ffmpegPath;
  }

  isAvailable() {
    return !!this.ffmpegPath;
  }

  runningCount() {
    let n = 0;
    for (const en of this.entries.values()) {
      if (!en.terminated && en.child.exitCode == null) n += 1;
    }
    return n;
  }

  isRunning(streamId) {
    const en = this.entries.get(streamId);
    return !!en && !en.terminated && en.child.exitCode == null;
  }

  _buildArgs(stream, filePath) {
    const kbps = stream.quality === '1080p' ? 3500 : 2000;
    const scale = stream.quality === '1080p' ? '-2:1080' : '-2:720';
    const args = [
      '-hide_banner',
      '-loglevel',
      'warning',
      '-nostdin',
      '-stream_loop',
      '-1',
      '-re',
      '-i',
      filePath,
      '-map',
      '0:v:0',
      '-vf',
      `scale=${scale}`,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-pix_fmt',
      'yuv420p',
      '-b:v',
      `${kbps}k`,
      '-maxrate',
      `${kbps}k`,
      '-bufsize',
      `${kbps * 2}k`,
      '-r',
      '30',
      '-g',
      '60',
      '-keyint_min',
      '60',
      '-sc_threshold',
      '0',
      '-map',
      '0:a:0?',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-ar',
      '44100',
      '-sn',
      '-dn',
      '-threads',
      '0',
      '-progress',
      'pipe:1',
      '-nostats',
      '-f',
      'flv',
      stream.rtmp_url,
    ];
    return args;
  }

  async start(stream, filePath) {
    if (this.isRunning(stream.id)) return { started: false, reason: 'already_running' };
    if (!this.ffmpegPath) return { started: false, reason: 'ffmpeg_unavailable' };

    const child = spawn(this.ffmpegPath, this._buildArgs(stream, filePath), {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const entry = {
      streamId: stream.id,
      streamName: stream.name,
      startedMs: Date.now(),
      progress: { outTimeUs: 0, fps: 0, bitrate: 0, speed: 0 },
      stderrTail: [],
      stopRequested: false,
      terminated: false,
      exitCode: null,
      lastErrorLine: null,
      child,
    };
    this.entries.set(stream.id, entry);

    child.stdout?.on('data', (chunk) => this._parseProgress(entry, chunk));
    child.stderr?.on('data', (chunk) => this._tail(entry, chunk));

    child.on('error', (err) => {
      entry.terminated = true;
      entry.lastErrorLine = `Failed to launch FFmpeg: ${err.message}`;
    });

    child.on('exit', (code) => {
      entry.terminated = true;
      entry.exitCode = code;
      entry.lastErrorLine =
        entry.lastErrorLine || (code && code !== 0 ? `FFmpeg exited with code ${code}` : null);
    });

    return { started: true, pid: child.pid, entry };
  }

  _parseProgress(entry, chunk) {
    const lines = chunk.toString('utf8').split('\n');
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const idx = line.indexOf('=');
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (key === 'out_time_us') entry.progress.outTimeUs = Number(value) || 0;
      else if (key === 'fps') entry.progress.fps = Number(value) || 0;
      else if (key === 'bitrate') entry.progress.bitrate = parseFloat(value) || 0;
      else if (key === 'speed') entry.progress.speed = parseFloat(value) || 0;
    }
  }

  _tail(entry, chunk) {
    const lines = chunk.toString('utf8').split('\n');
    for (const raw of lines) {
      const line = raw.replace(/[\r\n]+$/, '');
      if (line.trim()) entry.stderrTail.push(line);
    }
    resizeTail(entry.stderrTail, 60);
    const last = entry.stderrTail[entry.stderrTail.length - 1];
    if (last) entry.lastErrorLine = last;
  }

  lastError(streamId) {
    const en = this.entries.get(streamId);
    return en?.lastErrorLine || null;
  }

  async stop(streamId) {
    const en = this.entries.get(streamId);
    if (!en || en.terminated) return true;
    en.stopRequested = true;
    try {
      en.child.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    await new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      en.child.once('exit', finish);
      setTimeout(() => {
        if (!en.terminated) {
          try {
            en.child.kill('SIGKILL');
          } catch {
            /* ignore */
          }
        }
        finish();
      }, 3000);
    });
    this.entries.delete(streamId);
    return true;
  }

  async forceStop() {
    const ids = Array.from(this.entries.keys());
    await Promise.all(ids.map((id) => this.stop(id).catch(() => true)));
    return ids.length;
  }

  stats(stream) {
    const en = this.entries.get(stream.id);
    if (!en || en.terminated || en.child.exitCode != null) {
      return { bitrate: 0, fps: 0, speed: 1, quality: 'poor', errors: ['Stream is not running'] };
    }
    const uptimeSec = Math.max((Date.now() - en.startedMs) / 1000, 0.1);
    let speed = en.progress.speed;
    if (!speed && en.progress.outTimeUs > 0) {
      speed = en.progress.outTimeUs / 1e6 / uptimeSec;
    }
    if (!speed || speed <= 0) speed = 1;
    const quality =
      speed >= 0.98 && speed <= 1.02
        ? 'excellent'
        : speed >= 0.95 && speed <= 1.05
          ? 'good'
          : speed >= 0.9 && speed <= 1.1
            ? 'fair'
            : 'poor';
    return {
      bitrate: Math.round(en.progress.bitrate || 0),
      fps: Math.round((en.progress.fps || 0) * 10) / 10,
      speed: Math.round(speed * 1000) / 1000,
      quality,
      errors: [],
    };
  }

  runningEntries() {
    return Array.from(this.entries.values()).filter(
      (en) => !en.terminated && en.child.exitCode == null,
    );
  }

  /**
   * Watchdog pass. Run on an interval from the server.
   */
  async tick() {
    let streams;
    try {
      streams = await this.store.getStreams();
    } catch {
      return;
    }
    const now = Date.now();

    for (const stream of streams) {
      const alive = this.isRunning(stream.id);

      if (stream.status === 'running') {
        if (alive) {
          const st = this.restartState.get(stream.id);
          if (st && st.count > 0 && now - st.lastAt > 60_000) {
            this.restartState.set(stream.id, { count: 0, lastAt: st.lastAt, error: null });
          }
          continue;
        }
        await this._maybeRestart(stream, now);
        continue;
      }

      // stream is stopped/error -> drop stale process info
      if (this.entries.has(stream.id)) {
        this.entries.delete(stream.id);
      }
    }

    // kill leftover processes for streams that no longer exist
    const knownIds = new Set(streams.map((s) => s.id));
    for (const [id, en] of this.entries) {
      if (!knownIds.has(id)) {
        en.stopRequested = true;
        try {
          en.child.kill('SIGKILL');
        } catch {
          /* ignore */
        }
        this.entries.delete(id);
      }
    }
  }

  async _maybeRestart(stream, now) {
    const st = this.restartState.get(stream.id) || { count: 0, lastAt: 0, error: null };

    if (stream.auto_restart === false || st.count >= config.FFMPEG_MAX_RESTARTS) {
      await this._fail(stream, st);
      return;
    }
    if (st.lastAt > 0 && now - st.lastAt < config.FFMPEG_RESTART_DELAY_MS) {
      return; // wait for the backoff window before trying again
    }

    const file = await this.findVideoFile(stream).catch(() => null);
    if (!file) {
      st.count += 1;
      st.lastAt = now;
      st.error = `Video file not found: ${stream.video_name || stream.video_id}`;
      this.restartState.set(stream.id, st);
      await this._fail(stream, st);
      return;
    }

    const fresh = await this.store.getStream(stream.id).catch(() => null);
    if (!fresh || fresh.status !== 'running') return;

    st.count += 1;
    st.lastAt = now;
    this.restartState.set(stream.id, st);

    const res = await this.start(fresh, file);
    if (res.started) {
      console.log(
        `[ffmpeg] ${fresh.name || fresh.id} restarted (attempt ${st.count}/${config.FFMPEG_MAX_RESTARTS})`,
      );
    }
  }

  async _fail(stream, st) {
    const msg =
      st?.error ||
      this.lastError(stream.id) ||
      `FFmpeg process exited unexpectedly for "${stream.name}"`;
    await this.store.updateStream(stream.id, { status: 'error', error_message: msg });
  }

  async shutdown() {
    await this.forceStop();
  }
}

module.exports = { FfmpegManager, resolveFfmpeg, manager: new FfmpegManager(null) };