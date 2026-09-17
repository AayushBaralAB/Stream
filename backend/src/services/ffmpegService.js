const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const Log = require('../models/Log');
const Settings = require('../models/Settings');

let currentProcess = null;
let streamStartTime = null;

function getFFmpegPath() {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    return 'ffmpeg';
  } catch {
    return null;
  }
}

function buildHLSOutput(hlsDir) {
  return [
    `-f`, `hls`,
    `-hls_time`, `4`,
    `-hls_list_size`, `10`,
    `-hls_flags`, `delete_segments+append_list`,
    `-hls_segment_filename`, path.join(hlsDir, 'segment_%03d.ts'),
    path.join(hlsDir, 'stream.m3u8'),
  ];
}

function buildRTMPOutputs(destinations) {
  const outputs = [];
  for (const dest of destinations) {
    if (!dest.rtmpUrl || !dest.streamKey) continue;
    outputs.push(
      `-c:v`, `copy`,
      `-c:a`, `copy`,
      `-f`, `flv`,
      `${dest.rtmpUrl}/${dest.streamKey}`,
    );
  }
  return outputs;
}

function buildLogoOverlay(logoPath, settings) {
  if (!logoPath || !fs.existsSync(logoPath)) return [];
  const width = settings?.logoWidth || 150;
  const margin = settings?.logoMargin || 20;
  const opacity = settings?.logoOpacity || 1.0;

  return [
    `-i`, logoPath,
    `-filter_complex`,
    `[1:v][0:v]overlay=W-w-${margin}:${margin}:format=auto:alpha=${opacity}`,
  ];
}

async function logMessage(level, message, source = 'ffmpeg', streamId = null, metadata = {}) {
  try {
    await Log.create({ level, message, source, streamId, metadata });
  } catch (e) {
    console.error('Failed to write log:', e.message);
  }
}

function getInputArgs(source) {
  switch (source.type) {
    case 'upload':
    case 'url':
      return ['-re', '-i', source.pathOrUrl];
    case 'rtmp_input':
      return ['-i', source.pathOrUrl];
    default:
      throw new Error('Invalid source type');
  }
}

async function startStream({ source, destinations, streamId, logoSettings }) {
  if (currentProcess) {
    throw new Error('Stream already running');
  }

  const ffmpegPath = getFFmpegPath();
  if (!ffmpegPath) {
    throw new Error('FFmpeg not found on this system');
  }

  const hlsDir = process.env.HLS_DIR || '/data/hls';
  fs.mkdirSync(hlsDir, { recursive: true });

  const existingFiles = fs.readdirSync(hlsDir).filter(f => f.endsWith('.ts') || f.endsWith('.m3u8'));
  for (const file of existingFiles) {
    try { fs.unlinkSync(path.join(hlsDir, file)); } catch {}
  }

  const args = [];
  args.push(...getInputArgs(source));

  const logoPath = logoSettings?.logoPath;
  const useLogo = logoSettings?.enabled && logoPath && fs.existsSync(logoPath);

  if (useLogo) {
    args.push('-i', logoPath);
    const w = logoSettings.width || 150;
    const m = logoSettings.margin || 20;
    const o = logoSettings.opacity ?? 1.0;
    args.push('-filter_complex',
      `[1:v][0:v]overlay=W-w-${m}:${m}:format=auto:alpha=${o}[out]`,
      '-map', '[out]');
  }

  args.push(...buildHLSOutput(hlsDir));

  if (destinations && destinations.length > 0) {
    for (const dest of destinations) {
      if (!dest.rtmpUrl || !dest.streamKey) continue;
      args.push(
        '-c:v', 'copy',
        '-c:a', 'copy',
        '-f', 'flv',
        `${dest.rtmpUrl}/${dest.streamKey}`,
      );
    }
  }

  await logMessage('info', `Starting stream with source: ${source.type}`, 'ffmpeg', streamId);

  const proc = spawn(ffmpegPath, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
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
      logMessage('debug', msg, 'ffmpeg', streamId);
    }
  });

  proc.on('close', async (code) => {
    await logMessage('info', `FFmpeg process exited with code ${code}`, 'ffmpeg', streamId);
    currentProcess = null;
    streamStartTime = null;
  });

  proc.on('error', async (err) => {
    await logMessage('error', `FFmpeg error: ${err.message}`, 'ffmpeg', streamId);
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

    proc.on('close', () => {
      currentProcess = null;
      streamStartTime = null;
      resolve({ stopped: true });
    });

    try {
      proc.kill('SIGTERM');
      setTimeout(() => {
        if (currentProcess) {
          try { currentProcess.kill('SIGKILL'); } catch {}
          currentProcess = null;
          streamStartTime = null;
          resolve({ stopped: true });
        }
      }, 5000);
    } catch (err) {
      currentProcess = null;
      streamStartTime = null;
      resolve({ stopped: true, error: err.message });
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

module.exports = { startStream, stopStream, getStreamStatus };
