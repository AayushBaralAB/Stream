'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createReadStream } = require('fs');
const express = require('express');
const multer = require('multer');
const config = require('./config');

const router = express.Router();

const MIME = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

function mimeFor(name) {
  return MIME[path.extname(name).toLowerCase()] || 'application/octet-stream';
}

function sanitizeExt(originalName) {
  const stripped = path.extname(originalName || '').toLowerCase().replace(/[^a-z0-9.]/g, '');
  return /^\.[a-z0-9]{1,10}$/.test(stripped) ? stripped : '.bin';
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.UPLOAD_DIR),
  filename: (_req, file, cb) =>
    cb(null, `${crypto.randomBytes(16).toString('hex')}${sanitizeExt(file.originalname)}`),
});

const upload = multer({
  storage,
  limits: { fileSize: config.MAX_FILE_SIZE },
});

/* ------------------------------ upload ------------------------------- */

router.post('/videos/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file provided' });
      return;
    }
    const video = await insertVideoRecord(req.file);
    res.json({ success: true, video });
  } catch (err) {
    next(err);
  }
});

async function insertVideoRecord(file) {
  const stat = fs.statSync(file.path);
  const video = {
    filename: file.filename,
    original_name: file.originalname,
    file_path: `${config.BASE_PATH}/media/${file.filename}`,
    thumbnail_path: null,
    file_size: stat.size,
    created_at: new Date().toISOString(),
  };
  const { store } = require('./db');
  return store.insertVideo(video);
}

/* ------------------------------- list -------------------------------- */

router.get('/videos/list', async (_req, res, next) => {
  try {
    const { store } = require('./db');
    const videos = await store.getVideos();
    res.json({ videos });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------ reorder ------------------------------ */

router.post('/videos/reorder', async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : [];
    if (ids.length === 0) {
      res.status(400).json({ error: 'ids array is required' });
      return;
    }
    const { store } = require('./db');
    await store.reorderVideos(ids);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------- delete ------------------------------ */

router.delete('/videos/:id/delete', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid video id' });
      return;
    }
    const { store } = require('./db');
    const video = await store.getVideo(id);
    if (!video) {
      res.status(404).json({ error: 'Video not found' });
      return;
    }
    await store.deleteVideo(id);
    await store.deleteStreamsByVideoId(id);
    const full = path.join(config.UPLOAD_DIR, video.filename);
    await new Promise((resolve) => fs.rm(full, { force: true }, () => resolve()));
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------- media ------------------------------- */

function sendRange(req, res, next, filePath) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    next();
    return;
  }
  if (!stat.isFile()) {
    next();
    return;
  }
  const size = stat.size;
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', mimeFor(filePath));
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

  const range = req.headers.range;
  let start = 0;
  let end = size - 1;
  let status = 200;

  if (range && /^bytes=/.test(range)) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (m) {
      const first = m[1] === '' ? undefined : Number(m[1]);
      const last = m[2] === '' ? undefined : Number(m[2]);
      if (first === undefined && last !== undefined && last >= 0) {
        start = Math.max(size - last, 0);
        end = size - 1;
      } else if (first !== undefined && first < size) {
        start = first;
        end = last === undefined ? size - 1 : Math.min(last, size - 1);
      } else {
        res.status(416).setHeader('Content-Range', `bytes */${size}`).end();
        return;
      }
      if (start <= end) {
        status = 206;
        res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
      }
    }
  }

  res.status(status);
  res.setHeader('Content-Length', end - start + 1);
  const stream = createReadStream(filePath, { start, end });
  stream.on('error', next);
  stream.pipe(res);
}

router.get('/api/media/:name', (req, res, next) => {
  const name = path.basename(decodeURIComponent(req.params.name));
  sendRange(req, res, next, path.join(config.UPLOAD_DIR, name));
});

/* ------------------------- media (root /media) ------------------------ */

const mediaRouter = express.Router();

mediaRouter.get('/:name', (req, res, next) => {
  const name = path.basename(decodeURIComponent(req.params.name));
  sendRange(req, res, next, path.join(config.UPLOAD_DIR, name));
});

/* ---------------------------- thumbnails ------------------------------ */

router.get('/thumbnails/:name', (req, res, next) => {
  const name = path.basename(decodeURIComponent(req.params.name));
  const candidates = [
    path.join(config.UPLOAD_DIR, 'thumbnails', name),
    path.join(config.ROOT, 'public', 'uploads', 'thumbnails', name),
    path.join(config.ROOT, 'out', 'uploads', 'thumbnails', name),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) {
        sendRange(req, res, next, candidate);
        return;
      }
    } catch {
      /* try next */
    }
  }
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">' +
    '<rect width="100%" height="100%" fill="#262626"/>' +
    '<circle cx="320" cy="160" r="52" fill="none" stroke="#525252" stroke-width="14"/>' +
    '<path d="M300 132l52 28-52 28z" fill="#a3a3a3"/>' +
    '<text x="320" y="270" font-family="Arial" font-size="22" fill="#737373" text-anchor="middle">No thumbnail</text>' +
    '</svg>';
  res
    .status(200)
    .setHeader('Content-Type', 'image/svg+xml')
    .setHeader('Cache-Control', 'public, max-age=86400')
    .send(Buffer.from(svg));
});

/* ------------------------------- util -------------------------------- */

function resolveStoredMediaByFilename(filename) {
  const safe = path.basename(filename);
  const full = path.join(config.UPLOAD_DIR, safe);
  try {
    return fs.statSync(full).isFile() ? full : null;
  } catch {
    return null;
  }
}

module.exports = { router, mediaRouter, resolveStoredMediaByFilename, mimeFor };