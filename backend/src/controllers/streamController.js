const streamManager = require('../services/streamManager');
const Stream = require('../models/Stream');

exports.startStream = async (req, res) => {
  try {
    const { sourceType, sourceUrl, sourceUrls, videoId, videoIds, loop, destinationIds } = req.body;

    const stream = await streamManager.initiateStream({
      sourceType,
      sourceUrl,
      sourceUrls: sourceUrls || [],
      videoId,
      videoIds: videoIds || [],
      loop: loop === true,
      destinationIds: destinationIds || [],
      userId: req.user._id,
    });

    res.json({ message: 'Stream started', stream });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.stopStream = async (req, res) => {
  try {
    const result = await streamManager.terminateStream();
    res.json({ message: 'Stream stopped', ...result });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.getStatus = async (req, res) => {
  try {
    const status = streamManager.getCurrentStatus();
    let activeStream = null;
    if (status.running) {
      activeStream = await Stream.findOne({ status: 'running' })
        .sort({ createdAt: -1 })
        .populate('destinationIds', 'name platform enabled')
        .populate('videoId', 'originalName')
        .populate('playlist', 'originalName');
    }
    res.json({ status, stream: activeStream });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getHistory = async (req, res) => {
  try {
    const streams = await Stream.find({ createdBy: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('destinationIds', 'name platform')
      .populate('videoId', 'originalName')
      .populate('playlist', 'originalName');
    res.json({ streams });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
