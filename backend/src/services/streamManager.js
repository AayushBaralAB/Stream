const Stream = require('../models/Stream');
const Destination = require('../models/Destination');
const ffmpegService = require('./ffmpegService');
const { resolveExternalSource } = require('./externalSource');
const { decrypt } = require('./encryptionService');
const Log = require('../models/Log');

const EXTERNAL_TYPES = ['youtube', 'facebook', 'tiktok'];
const DAY_SECONDS = 24 * 60 * 60;

// Durations of the currently running playlist, used to compute the "now playing"
// video index for the UI. Reset when a stream stops.
let activePlaylist = null;

// The exact source/destinations/streamId of the running broadcast, so overlay
// settings (ticker on/off, logo) can be re-applied to the live ffmpeg process.
let activeLaunch = null;
let restartInFlight = false;

// Read the current logo + ticker configuration from Settings/News.
async function buildOverlayConfig() {
  const Settings = require('../models/Settings');
  const News = require('../models/News');
  const logoEnabled = await Settings.get('logoEnabled', false);
  const logoPath = await Settings.get('logoPath', '');
  const logoWidth = await Settings.get('logoWidth', 150);
  const logoMargin = await Settings.get('logoMargin', 20);
  const logoOpacity = await Settings.get('logoOpacity', 1.0);

  const logoSettings = {
    enabled: logoEnabled,
    logoPath,
    width: logoWidth,
    margin: logoMargin,
    opacity: logoOpacity,
  };

  const tickerEnabled = await Settings.get('tickerEnabled', true);
  const tickerSpeed = await Settings.get('tickerSpeed', 60);
  let tickerText = '';
  if (tickerEnabled) {
    const activeNews = await News.find({ active: true }).sort({ priority: -1, createdAt: 1 });
    tickerText = activeNews.map((n) => n.text).join('    •    ');
  }
  const ticker = {
    enabled: tickerEnabled,
    speed: tickerSpeed,
    text: tickerText,
  };

  return { logoSettings, ticker };
}

function computeCurrentIndex(uptime) {
  if (!activePlaylist) return 0;
  const { durations, loop } = activePlaylist;
  const total = durations.reduce((a, b) => a + b, 0);
  if (!total) return 0;
  let t = loop ? (uptime % total) : Math.min(uptime, Math.max(total - 0.5, 0));
  let acc = 0;
  for (let i = 0; i < durations.length; i++) {
    acc += durations[i];
    if (t < acc) return i;
  }
  return durations.length - 1;
}

async function initiateStream({ sourceType, sourceUrl, sourceUrls, videoId, videoIds, loop, destinationIds, userId }) {
  const currentStatus = ffmpegService.getStreamStatus();
  if (currentStatus.running) {
    throw new Error('A stream is already running. Stop it first.');
  }

  let source = null;
  let resolvedVideoIds = [];
  let durations = [];
  let activePlaylistDurations = [];

  if (sourceType === 'upload') {
    const Video = require('../models/Video');
    const ids = (Array.isArray(videoIds) && videoIds.length > 0)
      ? videoIds
      : (videoId ? [videoId] : []);

    if (ids.length === 0) {
      throw new Error('Select at least one video to stream');
    }

    const videos = await Video.find({ _id: { $in: ids }, uploadedBy: userId });
    const found = videos.map(v => v._id.toString());
    for (const id of ids) {
      if (!found.includes(id)) {
        throw new Error('Video not found or does not belong to you');
      }
    }

    const ordered = ids.map(id => videos.find(v => v._id.toString() === id));
    resolvedVideoIds = ordered.map(v => v._id);
    source = {
      type: 'upload',
      paths: ordered.map(v => v.path),
      loop: loop === true,
    };
    for (const v of ordered) {
      let dur = Number(v.duration) || 0;
      if (!dur) dur = ffmpegService.probeMedia(v.path).duration || 0;
      durations.push(dur || 5);
    }
    activePlaylistDurations = durations;
  } else if (EXTERNAL_TYPES.includes(sourceType)) {
    const urls = (Array.isArray(sourceUrls) && sourceUrls.length > 0)
      ? sourceUrls
      : (sourceUrl ? [sourceUrl] : []);

    if (urls.length === 0) {
      throw new Error(`${sourceType} URL is required`);
    }

    const resolvedList = [];
    const audioList = [];
    const { getYtDlpCommand } = require('./externalSource');
    for (const url of urls) {
      const resolved = await resolveExternalSource(url);
      if (!resolved.ok) {
        throw new Error(`Could not resolve ${sourceType} source: ${resolved.error}`);
      }
      resolvedList.push(resolved.videoUrl);
      audioList.push(resolved.audioUrl || null);
    }

    // Probe each resolved URL so the "now playing" index is accurate and so the
    // FFmpeg layer can tell which items are finite VODs (normalize + loop) vs live.
    const urlProbes = resolvedList.map((u) => ffmpegService.probeMedia(u));
    const urlDurations = urlProbes.map((p) => (p.hasVideo && p.duration > 0 ? p.duration : 0));

    // A multi-URL playlist is normalized with the concat FILTER, which takes one
    // input per item. Items whose audio comes as a separate URL (typical for
    // YouTube) cannot feed two inputs per item into that graph, so download and
    // merge those items to a local MP4 first (multi-URL items are always VODs,
    // since live/undetermined sources are rejected below).
    if (urls.length > 1) {
      const os = require('os');
      const fs = require('fs');
      for (let i = 0; i < urls.length; i++) {
        if (!audioList[i]) continue;
        const outPath = path.join(os.tmpdir(), `stream_merge_${Date.now()}_${i}.mp4`);
        const { cmd, args } = getYtDlpCommand();
        await new Promise((resolve, reject) => {
          require('child_process').execFile(
            cmd,
            [...args, '--no-warnings', '--no-playlist', '--no-check-certificates', '--geo-bypass',
              '-f', 'bv*+ba', '--merge-output-format', 'mp4', '-o', outPath, urls[i]],
            { timeout: 10 * 60 * 1000, windowsHide: true },
            (err, stdout, stderr) => {
              if (err) reject(new Error(`Could not download ${sourceType} source: ${(stderr || '').trim().split('\n').pop() || err.message}`));
              else resolve();
            },
          );
        });
        if (!fs.existsSync(outPath) || fs.statSync(outPath).size === 0) {
          throw new Error(`Could not download ${sourceType} source to a playable file`);
        }
        resolvedList[i] = outPath;
        audioList[i] = null;
      }
    }

    source = {
      type: 'url',
      paths: resolvedList,
      audioPaths: audioList,
      loop: loop === true,
      durations: urlDurations,
    };

    // Live/unknown items never end, so they keep the playlist on that item.
    activePlaylistDurations = urlDurations.map((d) => (d > 0 ? d : DAY_SECONDS));
  } else {
    throw new Error('Invalid source configuration. Use an uploaded video playlist or a YouTube / Facebook / TikTok URL.');
  }

  const destinations = [];
  if (destinationIds && destinationIds.length > 0) {
    for (const destId of destinationIds) {
      const dest = await Destination.findById(destId);
      if (!dest || !dest.enabled) continue;
      destinations.push({
        ...dest.toObject(),
        streamKey: decrypt(dest.streamKey),
      });
    }
  }
const { logoSettings, ticker } = await buildOverlayConfig();

  const stream = await Stream.create({
    sourceType,
    sourceUrl: sourceType !== 'upload' ? (Array.isArray(sourceUrls) ? (sourceUrls[0] || sourceUrl || '') : (sourceUrl || '')) : '',
    sourceUrls: sourceType !== 'upload' ? (Array.isArray(sourceUrls) ? sourceUrls : (sourceUrl ? [sourceUrl] : [])) : [],
    videoId: resolvedVideoIds[0] || null,
    playlist: resolvedVideoIds,
    loop: loop === true,
    destinationIds: destinationIds || [],
    status: 'starting',
    createdBy: userId,
    destinationStatuses: destinationIds.map(id => ({
      destination: id,
      status: 'connecting',
    })),
  });

  try {
    const result = await ffmpegService.startStream({
      source,
      destinations,
      streamId: stream._id,
      logoSettings,
      ticker,
    });

    stream.pid = result.pid;
    stream.startedAt = result.startedAt;
    stream.status = 'running';
    stream.error = '';
    stream.destinationStatuses = stream.destinationStatuses.map(ds => ({
      ...ds,
      status: 'streaming',
    }));
    await stream.save();

    for (const destId of destinationIds || []) {
      await Destination.findByIdAndUpdate(destId, { lastUsed: new Date() });
    }

    await Log.create({ level: 'info', message: `Stream started by user (loop: ${loop ? 'yes' : 'no'}, items: ${sourceType === 'upload' ? resolvedVideoIds.length : (source.paths ? source.paths.length : 1)})`, source: 'stream-manager', streamId: stream._id });

    activePlaylist = activePlaylistDurations.length ? { durations: activePlaylistDurations, loop: loop === true } : null;
    activeLaunch = { source, destinations, streamId: stream._id };

    return stream;
  } catch (error) {
    activePlaylist = null;
    stream.status = 'error';
    stream.error = error.message;
    await stream.save();
    await Log.create({ level: 'error', message: `Stream start failed: ${error.message}`, source: 'stream-manager', streamId: stream._id });
    throw error;
  }
}

async function terminateStream() {
  const result = await ffmpegService.stopStream();
  activePlaylist = null;
  activeLaunch = null;
  const activeStream = await Stream.findOne({ status: 'running' }).sort({ createdAt: -1 });

  if (activeStream) {
    activeStream.status = 'idle';
    activeStream.stoppedAt = new Date();
    activeStream.destinationStatuses = activeStream.destinationStatuses.map(ds => ({
      ...ds,
      status: 'disconnected',
    }));
    await activeStream.save();

    await Log.create({ level: 'info', message: 'Stream stopped', source: 'stream-manager', streamId: activeStream._id });
  }

  return { ...result, stream: activeStream };
}

function getCurrentStatus() {
  const status = ffmpegService.getStreamStatus();
  return { ...status, currentIndex: computeCurrentIndex(status.running ? status.uptime : 0) };
}

// Re-apply the live overlay configuration (ticker on/off, logo, speed) to the
// currently running broadcast without the user restarting the stream. FFmpeg
// builds its overlay graph at launch time, so applying changes means a quick
// stop + start of the same source/destinations against the same Stream record.
async function restartActive() {
  if (restartInFlight) return { restarted: false, message: 'Restart already in progress' };
  if (!activeLaunch || !ffmpegService.getStreamStatus().running) {
    return { restarted: false, message: 'No stream running' };
  }

  restartInFlight = true;
  try {
    const { source, destinations, streamId } = activeLaunch;
    const { logoSettings, ticker } = await buildOverlayConfig();

    await ffmpegService.stopStream();
    const result = await ffmpegService.startStream({ source, destinations, streamId, logoSettings, ticker });

    const active = await Stream.findById(streamId);
    if (active) {
      active.pid = result.pid;
      active.startedAt = result.startedAt;
      active.status = 'running';
      active.error = '';
      active.destinationStatuses = (active.destinationStatuses || []).map((ds) => ({ ...ds, status: 'streaming', error: '' }));
      await active.save();
    }

    await Log.create({
      level: 'info',
      message: `Overlay settings applied live (ticker: ${ticker.enabled ? 'on' : 'off'}, logo: ${logoSettings.enabled ? 'on' : 'off'})`,
      source: 'stream-manager',
      streamId,
    });

    return { restarted: true, ticker: ticker.enabled, logo: logoSettings.enabled };
  } finally {
    restartInFlight = false;
  }
}

module.exports = { initiateStream, terminateStream, getCurrentStatus, restartActive };