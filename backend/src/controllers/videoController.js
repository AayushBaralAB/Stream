const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const Video = require('../models/Video');

const uploadDir = process.env.UPLOAD_DIR || '/data/videos';
fs.mkdirSync(uploadDir, { recursive: true });

const ALLOWED_TYPES = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];
const MAX_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (ALLOWED_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: ${ALLOWED_TYPES.join(', ')}`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE },
});

exports.uploadVideo = [
  upload.single('video'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No video file provided' });
      }

      const video = await Video.create({
        filename: req.file.filename,
        originalName: req.file.originalname,
        path: req.file.path,
        size: req.file.size,
        mimeType: req.file.mimetype,
        uploadedBy: req.user._id,
      });

      res.status(201).json({ message: 'Video uploaded successfully', video });
    } catch (error) {
      res.status(500).json({ error: 'Upload failed: ' + error.message });
    }
  },
];

exports.getVideos = async (req, res) => {
  try {
    const videos = await Video.find({ uploadedBy: req.user._id })
      .sort({ createdAt: -1 });
    res.json({ videos });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteVideo = async (req, res) => {
  try {
    const video = await Video.findOne({ _id: req.params.id, uploadedBy: req.user._id });
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    try {
      fs.unlinkSync(video.path);
    } catch {}

    await Video.findByIdAndDelete(video._id);
    res.json({ message: 'Video deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
