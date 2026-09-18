const { spawn, execSync, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const Log = require('../models/Log');
const Stream = require('../models/Stream');

let currentProcess = null;
let streamStartTime = null;
let stopRequested = false;
let lastErrors = [];
const tempFiles = [];

function getFFmpegPath() {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    return 'ffmpeg';
  } catch {
    return null;
  }
}

function cleanTempFiles() {
  while (tempFiles.length > 0) {
    const f = tempFiles.pop();
    try { fs.unlinkSync(f); } catch (e) {}
  }
}

// Probe a media file for the params needed to build a playable playlist.
// Returns { hasVideo, hasAudio, width, height, duration, fps, vcodec, acodec, sampleRate, channels }.
function probeMedia(file) {
  const empty = { hasVideo: false, hasAudio: false, width: null, height: null, duration: 0, fps: 25, vcodec: null, acodec: null, sampleRate: null, channels: null };
  try {
    const out = execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 20000, killSignal: 'SIGKILL', maxBuffer: 8 * 1024 * 1024 }).toString();
    const j = JSON.parse(out);
    const vs = (j.streams || []).find((s) => s.codec_type === 'video');
    const aus = (j.streams || []).find((s) => s.codec_type === 'audio');
    if (!vs) return empty;
    let fps = 25;
    try {
      const [n, d] = (vs.r_frame_rate || '25/1').split('/').map(Number);
      fps = d ? n / d : n;
      if (!isFinite(fps) || fps <= 0) fps = 25;
    } catch (e) {}
    return {
      hasVideo: true,
      hasAudio: !!aus,
      width: vs.width || null,
      height: vs.height || null,
      duration: parseFloat((vs.duration && vs.duration !== 'N/A') ? vs.duration : (j.format?.duration || 0)) || 0,
      fps,
      vcodec: vs.codec_name || null,
      acodec: aus?.codec_name || null,
      sampleRate: aus?.sample_rate ? parseInt(aus.sample_rate, 10) : null,
      channels: aus?.channels || null,
    };
  } catch (e) {
    return empty;
  }
}

function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', args, { timeout: 5 * 60 * 1000, windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || '').toString().trim().split('\n').pop() || err.message));
      else resolve();
    });
  });
}

// A live playlist needs to loop safely across file boundaries, which the concat
// DEMUXER cannot do with -stream_loop (the H.264 decoder breaks at the switch).
// Reliable approach: normalize the whole playlist into ONE prepared MP4 with the
// concat FILTER (sun_running as fast as possible), then the live encoder plays
// that single file with -stream_loop -1 (the same proven single-video loop).
// Results are cached by playlist fingerprint so a restart is instant.
async function preparePlaylist(paths, hlsDir) {
  if (paths.length <= 1) return { paths };

  const fs = require('fs');
  const crypto = require('crypto');
  const preparedDir = path.join(hlsDir, 'prepared');
  fs.mkdirSync(preparedDir, { recursive: true });

  const hash = crypto.createHash('md5');
  for (const p of paths) {
    const stat = fs.existsSync(p) ? fs.statSync(p) : null;
    hash.update(p + '|' + (stat ? stat.size + '|' + stat.mtimeMs : 'x'));
  }
  const key = hash.digest('hex').slice(0, 16);
  const cached = path.join(preparedDir, `pl_${key}.mp4`);
  if (fs.existsSync(cached) && fs.statSync(cached).size > 0) {
    return { paths: [cached], prepared: true, cached: true };
  }

  const probes = paths.map((p) => probeMedia(p));
  const first = probes[0];
  const W = (first.width && first.width % 2 === 0) ? first.width : (Math.floor((first.width || 640) / 2) * 2);
  const H = (first.height && first.height % 2 === 0) ? first.height : (Math.floor((first.height || 360) / 2) * 2);
  const fps = Math.min(60, Math.max(20, Math.round(first.fps || 25)));

  let graph = '';
  for (let i = 0; i < paths.length; i++) {
    const p = probes[i];
    graph += `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p,fps=${fps}[v${i}];`;
    if (p.hasAudio) {
      graph += `[${i}:a]aformat=sample_rates=44100:channel_layouts=stereo[a${i}];`;
    } else {
      graph += `anullsrc=r=44100:cl=stereo[a${i}];`;
    }
  }
  const av = paths.map((_, i) => `[v${i}][a${i}]`).join('');
  graph += `${av}concat=n=${paths.length}:v=1:a=1[vcat][acat]`;

  const inputArgs = paths.map((p) => ['-i', p]).flat();
  try {
    await runFFmpeg([
      '-y', '-loglevel', 'error',
      ...inputArgs,
      '-filter_complex', graph,
      '-map', '[vcat]', '-map', '[acat]',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      cached,
    ]);
  } catch (e) {
    try { fs.unlinkSync(cached); } catch (e2) {}
    throw e;
  }

  // Keep the cache small: drop the oldest prepared files beyond 20.
  try {
    const files = fs.readdirSync(preparedDir)
      .map((f) => ({ f, t: fs.statSync(path.join(preparedDir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    for (const extra of files.slice(20)) {
      try { fs.unlinkSync(path.join(preparedDir, extra.f)); } catch (e) {}
    }
  } catch (e) {}

  return { paths: [cached], prepared: true };
}

function writeConcatFile(hlsDir, paths) {
  const file = path.join(hlsDir, 'playlist.txt');
  const lines = ['ffconcat version 1.0'];
  for (const p of paths) {
    const sp = p.split('\\').join('/').replace(/'/g, "'\\''");
    lines.push(`file '${sp}'`);
  }
  fs.writeFileSync(file, lines.join('\n'), 'utf8');
  return file;
}

// Build the FFmpeg INPUT argument list from a source descriptor.
// source = { type: 'upload', paths: [...], loop: bool }
//        | { type: 'url', paths: [...], loop: bool }   (already normalized to >= 1 items)
function buildInputArgs(source, hlsDir) {
  switch (source.type) {
    case 'upload': {
      const paths = source.paths || [];
      if (paths.length === 0) throw new Error('No video files selected');
      if (paths.length === 1) {
        return source.loop
          ? ['-stream_loop', '-1', '-re', '-i', paths[0]]
          : ['-re', '-i', paths[0]];
      }
      const playlistPath = writeConcatFile(hlsDir, paths);
      return source.loop
        ? ['-stream_loop', '-1', '-re', '-f', 'concat', '-safe', '0', '-i', playlistPath]
        : ['-re', '-f', 'concat', '-safe', '0', '-i', playlistPath];
    }
    case 'url': {
      const urls = (source.paths && source.paths.length > 0)
        ? source.paths
        : (source.pathOrUrl ? [source.pathOrUrl] : []);
      if (urls.length === 0) throw new Error('No source URL provided');
      // When yt-dlp resolves a platform URL into separate video + audio URLs
      // (typical for YouTube), feed BOTH as two inputs so the output has sound.
      // RTMP ingest (e.g. YouTube) drops/refuses a feed with no audio track.
      const audioUrl = (source.audioPaths && source.audioPaths.length > 0) ? source.audioPaths[0] : null;
      const args = [];
      args.push(...(source.loop ? ['-stream_loop', '-1'] : []), '-re', '-i', urls[0]);
      if (audioUrl) {
        args.push(...(source.loop ? ['-stream_loop', '-1'] : []), '-re', '-i', audioUrl);
      }
      return args;
    }
    default:
      throw new Error('Invalid source type');
  }
}

// Re-encode to H.264/AAC so HLS TS and RTMP FLV outputs always work,
// regardless of the uploaded container/codec.
function buildCodecArgs() {
  return ['-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '128k', '-g', '120'];
}

function buildHLSOutput(hlsDir) {
  return [
    '-f', 'hls',
    '-hls_time', '4',
    '-hls_list_size', '10',
    '-hls_flags', 'delete_segments+append_list',
    '-hls_segment_filename', path.join(hlsDir, 'segment_%03d.ts'),
    path.join(hlsDir, 'stream.m3u8'),
  ];
}

async function logMessage(level, message, source = 'ffmpeg', streamId = null, metadata = {}) {
  try {
    await Log.create({ level, message, source, streamId, metadata });
  } catch (e) {
    console.error('Failed to write log:', e.message);
  }
}

function resolveFont(text) {
  const usesDevanagari = text && /[\u0900-\u097F]/.test(text);
  if (process.env.TICKER_FONT && fs.existsSync(process.env.TICKER_FONT)) {
    return process.env.TICKER_FONT;
  }
  const candidates = process.platform === 'win32'
    ? (usesDevanagari
        ? ['C:\\Windows\\Fonts\\mangal.ttf', 'C:\\Windows\\Fonts\\arial.ttf', 'C:\\Windows\\Fonts\\segoeui.ttf']
        : ['C:\\Windows\\Fonts\\arial.ttf', 'C:\\Windows\\Fonts\\mangal.ttf', 'C:\\Windows\\Fonts\\segoeui.ttf'])
    : [
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/usr/share/fonts/dejavu/DejaVuSans.ttf',
        '/usr/share/fonts/noto/NotoSans-Regular.ttf',
      ];
  return candidates.find((c) => fs.existsSync(c)) || null;
}

// Make a path safe to embed inside a filter graph option (colons and
// backslashes are option separators / escapes to filter parsers).
// The working form for Windows drive letters is: 'C\:/path/to/font.ttf'
function escFilterPath(p) {
  const fwd = p.replace(/\\/g, '/');
  return `'${fwd.replace(/:/g, '\\:')}'`;
}

async function startStream({ source, destinations, streamId, logoSettings, ticker }) {
  if (currentProcess) {
    throw new Error('Stream already running');
  }

  const ffmpegPath = getFFmpegPath();
  if (!ffmpegPath) {
    throw new Error('FFmpeg not found on this system');
  }

  const hlsDir = process.env.HLS_DIR || path.join(__dirname, '../data/hls');
  fs.mkdirSync(hlsDir, { recursive: true });

  // Clean stale HLS segments + playlist from a previous stream
  try {
    const stale = fs.readdirSync(hlsDir).filter((f) =>
      f.endsWith('.ts') || f.endsWith('.m3u8') || f === 'playlist.txt' || f === 'stream.m3u8' || f === 'ticker.txt'
    );
    for (const f of stale) {
      try { fs.unlinkSync(path.join(hlsDir, f)); } catch (e) {}
    }
  } catch (e) {}

  const readyDests = (destinations || []).filter((d) => d.rtmpUrl && d.streamKey);
  const logoPath = logoSettings?.logoPath && fs.existsSync(logoSettings.logoPath)
    ? logoSettings.logoPath
    : null;
  const useLogo = logoSettings?.enabled === true && !!logoPath;

  const fontFile = resolveFont(ticker && ticker.text);
  const useTicker = !!(ticker && ticker.enabled && fontFile);
  let tickerFile = null;
  if (useTicker && ticker.text) {
    tickerFile = path.join(hlsDir, 'ticker.txt');
    fs.writeFileSync(tickerFile, ticker.text, 'utf8');
  }

  const args = [];
  let effPaths = source.paths;
  if (source.type === 'url' && source.paths && source.paths.length > 1) {
    // A playlist mix containing a live/undetermined source cannot be normalized
    // or chained. Live sources must be streamed individually.
    const urlDurations = source.durations || [];
    for (let i = 0; i < source.paths.length; i++) {
      if (!(urlDurations[i] > 0)) {
        throw new Error(`URL #${i + 1} is a live or undetermined source. Live sources must be streamed one at a time.`);
      }
    }
  }
  if ((source.type === 'upload' || source.type === 'url') && source.paths && source.paths.length > 1) {
    const prepared = await preparePlaylist(source.paths, hlsDir);
    effPaths = prepared.paths;
    if (prepared.prepared) {
      await logMessage('info', 'Playlist sources differ in codec/size — normalized to a single prepared file first', 'ffmpeg', streamId);
    }
  }
  args.push(...(effPaths ? buildInputArgs({ ...source, paths: effPaths }, hlsDir) : buildInputArgs(source, hlsDir)));

  // True when a second input (audio-only URL) was added for a URL source. That
  // shifts the logo input index by one and the audio to stream 1:a.
  const extraAudio = source.type === 'url'
    && !!(source.audioPaths && source.audioPaths.length)
    && !!source.audioPaths[0];

  // Number of video outputs to feed: HLS preview + each RTMP destination.
  // ffmpeg can't re-map one filter output twice, so duplicate it with `split`:
  //   ...[base];[base]split=N[vout0]..[voutN-1]
  const outputCount = 1 + readyDests.length;
  let voutLabels = null;

  if (useLogo || useTicker) {
    if (useLogo) args.push('-i', logoPath);

    let graph = '';
    let chain = null;

    if (useLogo) {
      const w = Number(logoSettings.width) || 150;
      const m = Number(logoSettings.margin) || 20;
      const o = logoSettings.opacity;
      const logoInput = extraAudio ? 2 : 1;
      graph += `[${logoInput}:v]scale=${w}:-1:force_original_aspect_ratio=decrease[logo];`;
      graph += `[0:v][logo]overlay=W-w-${m}:${m}:format=auto:alpha=${o},format=yuv420p[base];`;
      chain = 'base';
    } else {
      chain = '0:v';
    }

    // TV-style lower third: static BREAKING NEWS box (gloss + edge tab) on the
    // left, scrolling news text.
    if (useTicker) {
      const barH = 90;
      const chipW = 350;
      const f = escFilterPath(fontFile);
      const brandRed = '0xDC2626';
      const darkRed = '0x991B1B';
      graph += `[${chain}]drawbox=x=0:y=ih-${barH}:w=iw:h=${barH}:color=black@0.55:t=fill[bar];`;
      chain = 'bar';
      graph += `[${chain}]drawbox=x=0:y=ih-${barH + 3}:w=iw:h=3:color=${brandRed}:t=fill[accent];`;
      chain = 'accent';
      if (tickerFile && ticker.text) {
        const speed = Math.max(4, Number(ticker.speed) || 60);
        graph += `[${chain}]drawtext=fontfile=${f}:fontsize=42:fontcolor=white:borderw=1:bordercolor=black@0.5:textfile=${escFilterPath(tickerFile)}:x='w-190-mod(t*${speed},w-564+tw)':y=h-70[news];`;
        chain = 'news';
      }
      graph += `[${chain}]drawbox=x=0:y=ih-${barH}:w=${chipW}:h=${barH}:color=${brandRed}:t=fill[chip];`;
      chain = 'chip';
      graph += `[${chain}]drawbox=x=0:y=ih-${barH}:w=${chipW}:h=14:color=white@0.14:t=fill[chipSheen];`;
      chain = 'chipSheen';
      graph += `[${chain}]drawtext=fontfile=${f}:fontsize=32:fontcolor=white:borderw=1:bordercolor=${darkRed}:x=16:y=h-37:text='BREAKING NEWS'[chipLabel];`;
      chain = 'chipLabel';
      graph += `[${chain}]drawbox=x=${chipW - 5}:y=ih-${barH}:w=5:h=${barH}:color=${darkRed}:t=fill[chipEdge];`;
      chain = 'chipEdge';
    }

    if (outputCount > 1) {
      voutLabels = Array.from({ length: outputCount }, (_, i) => `vout${i}`);
      graph += `[${chain}]split=${outputCount}${voutLabels.map((l) => `[${l}]`).join('')};`;
    } else {
      voutLabels = [chain];
    }

    args.push('-filter_complex', graph);
  }

  const buildMapArgs = (labelIndex) => {
    const audioMap = extraAudio ? '1:a:0?' : '0:a:0?';
    if (useLogo || useTicker) {
      return ['-map', `[${voutLabels[labelIndex]}]`, '-map', audioMap];
    }
    return ['-map', '0:v:0', '-map', audioMap];
  };

  // HLS preview output
  args.push(...buildMapArgs(0), ...buildCodecArgs(), ...buildHLSOutput(hlsDir));

  // RTMP destination outputs
  for (let i = 0; i < readyDests.length; i++) {
    const dest = readyDests[i];
    args.push(...buildMapArgs(i + 1), ...buildCodecArgs(), '-f', 'flv', `${dest.rtmpUrl}/${dest.streamKey}`);
  }

  await logMessage('info', `Starting stream: source=${source.type} loop=${source.loop ? 'yes' : 'no'} logo=${useLogo ? 'yes' : 'no'} ticker=${useTicker ? 'yes' : 'no'} destinations=${readyDests.length}`, 'ffmpeg', streamId);

  const proc = spawn(ffmpegPath, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, TZ: process.env.STREAM_TIMEZONE || 'Asia/Kathmandu' },
  });

  currentProcess = proc;
  streamStartTime = new Date();

  proc.stdout.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) logMessage('debug', msg, 'ffmpeg', streamId);
  });

  proc.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg && !msg.includes('frame=')) {
      const noisy = /^(ffmpeg version|built with|configuration:|libav|--|Press \[q\]|\s+--|\s*$)/.test(msg);
      if (!noisy) {
        lastErrors.push(msg);
        if (lastErrors.length > 8) lastErrors.shift();
      }
      logMessage('debug', msg, 'ffmpeg', streamId);
    }
  });

  proc.on('close', async (code) => {
    await logMessage('info', `FFmpeg process exited with code ${code}`, 'ffmpeg', streamId);
    cleanTempFiles();
    const wasStopped = stopRequested;
    stopRequested = false;
    currentProcess = null;
    streamStartTime = null;

    // If the process died on its own (crashed / destination unreachable etc.),
    // persist the failure on the latest running stream record instead of leaving
    // it stuck in "running".
    if (!wasStopped) {
      const errorMsg = (lastErrors.join(' | ') || `FFmpeg exited (code ${code})`).slice(-500);
      lastErrors = [];
      try {
        const active = await Stream.findOne({ status: 'running' }).sort({ createdAt: -1 });
        if (active) {
          if (code === 0) {
            active.status = 'idle';
            active.stoppedAt = new Date();
            active.destinationStatuses = (active.destinationStatuses || []).map((ds) => ({ ...ds, status: 'disconnected', error: '' }));
            await active.save();
            await logMessage('info', 'Stream ended naturally', 'stream-manager', streamId);
          } else {
            active.status = 'idle';
            active.stoppedAt = new Date();
            active.error = errorMsg || `FFmpeg exited (code ${code})`;
            active.destinationStatuses = (active.destinationStatuses || []).map((ds) => ({ ...ds, status: 'error', error: errorMsg || `FFmpeg exited (code ${code})` }));
            await active.save();
            await logMessage('error', `Stream failed: ${active.error}`, 'stream-manager', streamId);
          }
          // Clean stale HLS output so the player reflects the stopped state.
          try {
            const stale = fs.readdirSync(hlsDir).filter((f) => f.endsWith('.ts') || f.endsWith('.m3u8') || f === 'playlist.txt');
            for (const f of stale) { try { fs.unlinkSync(path.join(hlsDir, f)); } catch (e) {} }
          } catch (e) {}
        }
      } catch (e) {
        await logMessage('error', `Failed to mark stream failed: ${e.message}`, 'stream-manager', streamId);
      }
    } else {
      lastErrors = [];
    }
  });

  proc.on('error', async (err) => {
    await logMessage('error', `FFmpeg error: ${err.message}`, 'ffmpeg', streamId);
    lastErrors.push(err.message);
    cleanTempFiles();
    currentProcess = null;
    streamStartTime = null;
  });

  return { pid: proc.pid, startedAt: streamStartTime };
}

function stopStream() {
  return new Promise((resolve) => {
    if (!currentProcess) {
      resolve({ stopped: false, message: 'No stream running' });
      return;
    }

    const proc = currentProcess;
    let done = false;
    const finish = (extra) => {
      if (done) return;
      done = true;
      currentProcess = null;
      streamStartTime = null;
      resolve({ stopped: true, ...extra });
    };

    stopRequested = true;
    cleanTempFiles();
    proc.once('close', () => finish({ code: 'close' }));

    try {
      proc.kill('SIGTERM');
      setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch (e) {}
        finish({ code: 'force-kill' });
      }, 5000);
    } catch (err) {
      finish({ error: err.message });
    }
  });
}

function getStreamStatus() {
  const running = currentProcess !== null && !currentProcess.killed;
  return {
    running,
    pid: currentProcess ? currentProcess.pid : null,
    startedAt: streamStartTime,
    uptime: running && streamStartTime ? Math.floor((Date.now() - streamStartTime.getTime()) / 1000) : 0,
  };
}

module.exports = { startStream, stopStream, getStreamStatus, probeMedia, preparePlaylist };