const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const Video = require('../models/Video');

const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../data/videos');
fs.mkdirSync(uploadDir, { recursive: true });

const ALLOWED_TYPES = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];
const ALLOWED_EXTENSIONS = new Set(['.mp4', '.webm', '.ogg', '.ogv', '.mov', '.avi', '.mkv', '.m4v', '.mpg', '.mpeg', '.ts', '.flv']);
const MAX_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_TYPES.includes(file.mimetype) || ALLOWED_EXTENSIONS.has(ext)) {
    cb(null, true);
  } else {
    cb(Object.assign(new Error(`Invalid file type: ${file.mimetype || ext}. Allowed video formats: MP4, WebM, OGG, MOV, AVI, MKV, MPEG, TS, FLV`), { statusCode: 400 }), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE },
});

function handleMulterError(err, res) {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large. Maximum video size is 2GB.' });
  }
  return res.status(err.statusCode || 400).json({ error: err.message || 'Upload failed' });
}

// Probe the media duration with ffprobe. Falls back to 0 if ffprobe is unavailable.
function probeDuration(filePath) {
  try {
    const stdout = execFileSync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ], { timeout: 30000, encoding: 'utf8' });
    const seconds = parseFloat(stdout.trim());
    return Number.isFinite(seconds) ? Math.round(seconds) : 0;
  } catch (e) {
    return 0;
  }
}

exports.uploadVideo = [
  (req, res, next) => {
    upload.single('video')(req, res, (err) => {
      if (err) return handleMulterError(err, res);
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No video file provided' });
      }

      const duration = probeDuration(req.file.path);

      const video = await Video.create({
        filename: req.file.filename,
        originalName: req.file.originalname,
        path: req.file.path,
        size: req.file.size,
        mimeType: req.file.mimetype,
        duration,
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