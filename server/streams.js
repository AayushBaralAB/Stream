'use strict';

const net = require('net');
const express = require('express');
const config = require('./config');

const router = express.Router();

function rtmpTarget(url) {
  const m = /^rtmps?:\/\/([^/:]+)(?::(\d+))?/i.exec(String(url || ''));
  if (!m) return null;
  const insecure = !/^rtmps:/i.test(String(url || ''));
  return { host: m[1], port: Number(m[2] || (insecure ? 1935 : 443)) };
}

function connectTest(target, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: target.host, port: target.port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Connection timed out connecting to ${target.host}:${target.port}`));
    }, timeoutMs);
    socket.once('connect', () => {
      clearTimeout(timer);
      socket.end();
      resolve();
    });
    socket.once('error', (err) => {
      clearTimeout(timer);
      reject(
        new Error(
          `Cannot reach ${target.host}:${target.port} (${err.code || err.message}). Check the RTMP URL and that the server can reach the internet.`,
        ),
      );
    });
  });
}

function validateStreamKey(rtmpUrl) {
  const slash = rtmpUrl.lastIndexOf('/');
  const server = slash > 0 ? rtmpUrl.slice(0, slash) : rtmpUrl;
  const streamKey = (slash >= 0 ? rtmpUrl.slice(slash + 1) : '').trim();
  const isPlaceholder = streamKey.toLowerCase().includes('xxxx');
  if (!streamKey || streamKey.length < 6 || isPlaceholder || /\s/.test(streamKey)) {
    const err = new Error(
      `Cannot connect "${rtmpUrl.split('/').pop() || ''}" using "${streamKey || '(no key)'}" as stream key. Edit the stream and enter your real stream key (from YouTube Studio → Go Live, or your provider).`,
    );
    err.status = 400;
    throw err;
  }
  return { server, streamKey };
}

function asBool(v, fallback) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v === 'true';
  return fallback;
}

/* ------------------------------- helpers ----------------------------- */

function withStore() {
  // eslint-disable-next-line global-require
  return require('./db').store;
}

function withFfmpeg() {
  // eslint-disable-next-line global-require
  return require('./ffmpeg').manager;
}

/* -------------------------------- list ------------------------------- */

router.get('/streams/list', async (_req, res, next) => {
  try {
    const streams = await withStore().getStreams();
    res.json({ streams });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------- create ------------------------------ */

router.post('/streams/create', async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    const videoId = Number(req.body?.videoId);
    const rtmpUrl = String(req.body?.rtmpUrl || '').trim();
    const quality = String(req.body?.quality || '720p');
    const loopEnabled = asBool(req.body?.loopEnabled, true);

    if (!name || !Number.isInteger(videoId) || !rtmpUrl) {
      res.status(400).json({ error: 'Name, video and RTMP URL are required' });
      return;
    }
    if (!/^rtmps?:\/\//i.test(rtmpUrl)) {
      res.status(400).json({ error: 'RTMP URL must start with rtmp:// or rtmps://' });
      return;
    }
    validateStreamKey(rtmpUrl);

    const store = withStore();
    const video = await store.getVideo(videoId);
    if (!video) {
      res.status(400).json({ error: 'Selected video does not exist' });
      return;
    }

    const stream = {
      name,
      video_id: videoId,
      video_name: video.original_name,
      rtmp_url: rtmpUrl,
      quality,
      loop_enabled: loopEnabled,
      status: 'stopped',
      started_at: null,
      error_message: null,
      created_at: new Date().toISOString(),
    };
    const created = await store.insertStream(stream);
    res.json({ success: true, stream: created });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------- update ------------------------------ */

router.put('/streams/:id/update', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const store = withStore();
    const stream = await store.getStream(id);
    if (!stream) {
      res.status(404).json({ error: 'Stream not found' });
      return;
    }
    if (stream.status === 'running') {
      res.status(400).json({ error: 'Stop the stream before editing it' });
      return;
    }
    const name = String(req.body?.name ?? stream.name).trim();
    const videoId = Number(req.body?.videoId ?? stream.video_id);
    const rtmpUrl = String(req.body?.rtmpUrl ?? stream.rtmp_url).trim();
    const quality = String(req.body?.quality ?? stream.quality);
    const loopEnabled = asBool(req.body?.loopEnabled, stream.loop_enabled);

    if (!name || !Number.isInteger(videoId) || !rtmpUrl) {
      res.status(400).json({ error: 'Name, video and RTMP URL are required' });
      return;
    }
    if (!/^rtmps?:\/\//i.test(rtmpUrl)) {
      res.status(400).json({ error: 'RTMP URL must start with rtmp:// or rtmps://' });
      return;
    }
    validateStreamKey(rtmpUrl);

    const video = await store.getVideo(videoId);
    if (!video) {
      res.status(400).json({ error: 'Selected video does not exist' });
      return;
    }

    const patch = {
      name,
      video_id: videoId,
      video_name: video.original_name,
      rtmp_url: rtmpUrl,
      quality,
      loop_enabled: loopEnabled,
    };
    await store.updateStream(id, patch);
    res.json({ success: true, stream: { ...stream, ...patch } });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------- delete ------------------------------ */

router.delete('/streams/:id/delete', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const store = withStore();
    const stream = await store.getStream(id);
    if (!stream) {
      res.status(404).json({ error: 'Stream not found' });
      return;
    }
    if (stream.status === 'running') {
      res.status(400).json({ error: 'Stop the stream before deleting it' });
      return;
    }
    await withFfmpeg().stop(id).catch(() => true);
    await store.deleteStream(id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------- start ------------------------------- */

router.post('/streams/start', async (req, res, next) => {
  try {
    const streamId = Number(req.body?.streamId);
    if (!Number.isInteger(streamId)) {
      res.status(400).json({ error: 'streamId is required' });
      return;
    }
    const store = withStore();
    const manager = withFfmpeg();
    const stream = await store.getStream(streamId);
    if (!stream) {
      res.status(404).json({ error: 'Stream not found' });
      return;
    }
    if (stream.status === 'running' && manager.isRunning(streamId)) {
      res.json({ success: true, connected: true, alreadyRunning: true });
      return;
    }
    if (!manager.isAvailable()) {
      res.status(500).json({ error: 'FFmpeg is not installed on this server. See AZURE_DEPLOYMENT.md.' });
      return;
    }
    let key;
    try {
      key = validateStreamKey(stream.rtmp_url);
    } catch (err) {
      res.status(400).json({ error: err.message });
      return;
    }
    const target = rtmpTarget(stream.rtmp_url);
    if (target) {
      try {
        await connectTest(target);
      } catch (err) {
        res.status(400).json({ error: err.message });
        return;
      }
    }

    const videoFile = await manager.findVideoFile(stream).catch(() => null);
    if (!videoFile) {
      res.status(400).json({
        error: `Video file (${stream.video_name || `video #${stream.video_id}`}) is missing on the server. Re-upload it first.`,
      });
      return;
    }

    await store.updateStream(streamId, {
      status: 'running',
      started_at: new Date().toISOString(),
      error_message: null,
    });
    const fresh = await store.getStream(streamId);
    const rc = manager.restartState.get(streamId);
    if (rc) rc.count = 0;
    await manager.start(fresh, videoFile);
    res.json({ success: true, connected: true, server: key.server, streamKey: key.streamKey });
  } catch (err) {
    next(err);
  }
});

/* -------------------------------- stop ------------------------------- */

router.post('/streams/stop', async (req, res, next) => {
  try {
    const streamId = Number(req.body?.streamId);
    if (!Number.isInteger(streamId)) {
      res.status(400).json({ error: 'streamId is required' });
      return;
    }
    const store = withStore();
    const stream = await store.getStream(streamId);
    if (!stream) {
      res.status(404).json({ error: 'Stream not found' });
      return;
    }
    const manager = withFfmpeg();
    if (manager.isRunning(streamId)) {
      await manager.stop(streamId);
    }
    await store.updateStream(streamId, { status: 'stopped', started_at: null });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/* ----------------------------- force-stop ----------------------------- */

router.post('/streams/force-stop', async (_req, res, next) => {
  try {
    const manager = withFfmpeg();
    const killed = await manager.forceStop();
    const store = withStore();
    const streams = await store.getStreams();
    for (const s of streams) {
      if (s.status === 'running') {
        await store.updateStream(s.id, { status: 'stopped', started_at: null });
      }
    }
    res.json({ success: true, stopped: killed });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------- cleanup ------------------------------ */

router.post('/streams/cleanup', async (_req, res, next) => {
  try {
    const store = withStore();
    const streams = await store.getStreams();
    const before = streams.length;
    const seen = new Map();
    const kept = [];
    for (const s of streams) {
      const key = `${s.video_id}:${s.rtmp_url}`;
      if (seen.has(key)) {
        await withFfmpeg().stop(s.id).catch(() => true);
        await store.deleteStream(s.id);
        continue;
      }
      seen.set(key, s);
      kept.push(s);
    }
    const removed = before - kept.length;
    res.json({ success: true, message: `Removed ${removed} duplicate stream(s)` });
  } catch (err) {
    next(err);
  }
});

/* ----------------------------- sync-status ---------------------------- */

router.post('/streams/sync-status', async (_req, res, next) => {
  try {
    const store = withStore();
    const manager = withFfmpeg();
    const streams = await store.getStreams();
    for (const s of streams) {
      if (s.status === 'running' && !manager.isRunning(s.id)) {
        await store.updateStream(s.id, { status: 'error', error_message: 'Stream stopped unexpectedly' });
      } else if (s.status !== 'running' && manager.isRunning(s.id)) {
        await manager.stop(s.id);
      }
    }
    res.json({ success: true, message: 'Status synchronized' });
  } catch (err) {
    next(err);
  }
});

/* ------------------------- dashboard-status --------------------------- */

router.get('/streams/dashboard-status', async (_req, res, next) => {
  try {
    const manager = withFfmpeg();
    res.json({ activeCount: manager.runningCount() });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------- stats -------------------------------- */

function aggregateStat(entries) {
  const list = entries.map((en) => en.stats);
  const summary = {
    totalStreams: entries.length,
    excellentStreams: list.filter((s) => s.quality === 'excellent').length,
    goodStreams: list.filter((s) => s.quality === 'good').length,
    fairStreams: list.filter((s) => s.quality === 'fair').length,
    poorStreams: list.filter((s) => s.quality === 'poor').length,
    streamsWithErrors: list.filter((s) => s.errors.length > 0).length,
  };
  const n = Math.max(list.length, 1);
  const avgBitrate = list.reduce((a, s) => a + s.bitrate, 0) / n;
  const avgFps = list.reduce((a, s) => a + s.fps, 0) / n;
  const avgSpeed = list.reduce((a, s) => a + s.speed, 0) / n;
  let totalDataTransferred = 0;
  let totalDroppedFrames = 0;
  const problemStreams = [];
  for (const en of entries) {
    const elapsed = Math.max((Date.now() - en.startedMs) / 1000, 0);
    totalDataTransferred += (en.stats.bitrate * 1024 * elapsed) / 8;
    if (en.stats.quality === 'poor') problemStreams.push(en.streamId);
  }
  const overallQuality =
    list.length === 0
      ? 'excellent'
      : avgSpeed >= 0.98 && avgSpeed <= 1.02
        ? 'excellent'
        : avgSpeed >= 0.95 && avgSpeed <= 1.05
          ? 'good'
          : avgSpeed >= 0.9 && avgSpeed <= 1.1
            ? 'fair'
            : 'poor';
  return {
    averages: {
      avgBitrate,
      avgFps,
      avgSpeed,
      totalDataTransferred,
      totalDroppedFrames,
      overallQuality,
      problemStreams,
    },
    summary,
  };
}

router.get('/streams/stats', async (req, res, next) => {
  try {
    const manager = withFfmpeg();
    const store = withStore();
    const streamId = Number(req.query?.streamId);
    if (!Number.isNaN(streamId) && streamId > 0) {
      const stream = await store.getStream(streamId);
      if (!stream) {
        res.status(404).json({ error: 'Stream not found' });
        return;
      }
      res.json(manager.stats(stream));
      return;
    }
    const entries = manager.runningEntries().map((en) => ({ ...en, stats: manager.stats({ id: en.streamId, name: en.streamName }) }));
    res.json(aggregateStat(entries));
  } catch (err) {
    next(err);
  }
});

/* ------------------------------ exports ------------------------------ */

function finalizeStreamsForShutdown() {
  // place for graceful shutdown housekeeping
}

module.exports = { router, rtmpTarget, connectTest, validateStreamKey, finalizeStreamsForShutdown };