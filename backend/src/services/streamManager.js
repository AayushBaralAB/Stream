const Stream = require('../models/Stream');
const Destination = require('../models/Destination');
const ffmpegService = require('./ffmpegService');
const { encrypt, decrypt } = require('./encryptionService');
const Log = require('../models/Log');
const fs = require('fs');
const path = require('path');

async function initiateStream({ sourceType, sourceUrl, videoId, destinationIds, userId }) {
  const currentStatus = ffmpegService.getStreamStatus();
  if (currentStatus.running) {
    throw new Error('A stream is already running. Stop it first.');
  }

  let sourcePathOrUrl = '';
  if (sourceType === 'upload' && videoId) {
    const Video = require('../models/Video');
    const video = await Video.findById(videoId);
    if (!video) throw new Error('Video not found');
    sourcePathOrUrl = video.path;
  } else if (sourceType === 'url') {
    sourcePathOrUrl = sourceUrl;
  } else if (sourceType === 'rtmp_input') {
    sourcePathOrUrl = sourceUrl;
  } else {
    throw new Error('Invalid source configuration');
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

  const Settings = require('../models/Settings');
  const logoEnabled = await Settings.get('logoEnabled', false);
  const logoPath = await Settings.get('logoPath', '');
  const logoWidth = await Settings.get('logoWidth', 150);
  const logoMargin = await Settings.get('logoMargin', 20);
  const logoOpacity = await Settings.get('logoOpacity', 1.0);

  const logoSettings = {
    enabled: logoEnabled,
    logoPath: logoPath,
    width: logoWidth,
    margin: logoMargin,
    opacity: logoOpacity,
  };

  const stream = await Stream.create({
    sourceType,
    sourceUrl: sourceType !== 'upload' ? sourceUrl : '',
    videoId: sourceType === 'upload' ? videoId : null,
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
      source: { type: sourceType, pathOrUrl: sourcePathOrUrl },
      destinations,
      streamId: stream._id,
      logoSettings,
    });

    stream.pid = result.pid;
    stream.startedAt = result.startedAt;
    stream.status = 'running';
    stream.destinationStatuses = stream.destinationStatuses.map(ds => ({
      ...ds,
      status: 'streaming',
    }));
    await stream.save();

    for (const destId of destinationIds) {
      await Destination.findByIdAndUpdate(destId, { lastUsed: new Date() });
    }

    await Log.create({ level: 'info', message: `Stream started by user`, source: 'stream-manager', streamId: stream._id });

    return stream;
  } catch (error) {
    stream.status = 'error';
    stream.error = error.message;
    await stream.save();
    await Log.create({ level: 'error', message: `Stream start failed: ${error.message}`, source: 'stream-manager', streamId: stream._id });
    throw error;
  }
}

async function terminateStream() {
  const result = await ffmpegService.stopStream();
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
  return ffmpegService.getStreamStatus();
}

module.exports = { initiateStream, terminateStream, getCurrentStatus };
