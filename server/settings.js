'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const config = require('./config');

const publicRouter = express.Router();
const adminRouter = express.Router();

const LOGO_EXT_RE = /\.(png|jpe?g|svg|webp|gif|ico)$/i;
const LOGO_DIR = config.UPLOAD_DIR;

function logoMime(name) {
  const ext = path.extname(name).toLowerCase();
  const table = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
  };
  return table[ext] || 'application/octet-stream';
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(LOGO_DIR, { recursive: true });
      cb(null, LOGO_DIR);
    },
    filename: (_req, file, cb) => {
      const extMatch = LOGO_EXT_RE.exec(file.originalname);
      const ext = extMatch ? `.${extMatch[1].toLowerCase()}` : '.png';
      cb(null, `logo-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
});

publicRouter.get('/settings', async (_req, res, next) => {
  try {
    const { store } = require('./db');
    const settings = await store.getSettings();
    res.json({ settings: settings || { appName: 'AB Streaming Software', logoPath: '/uploads/app-logo.svg' } });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/settings', upload.single('logo'), async (req, res, next) => {
  try {
    const { store } = require('./db');
    const current = (await store.getSettings()) || {
      appName: 'AB Streaming Software',
      logoPath: '/uploads/app-logo.svg',
    };
    const patch = { appName: current.appName, logoPath: current.logoPath };
    let appName = req.body?.appName;
    if (typeof appName === 'string') appName = appName.trim().slice(0, 40);
    if (appName) patch.appName = appName;
    if (req.file) {
      patch.logoPath = `${config.BASE_PATH}/media/${path.basename(req.file.path)}`;
    }
    const saved = await store.updateSettings(patch);
    res.json({ success: true, settings: saved });
  } catch (err) {
    next(err);
  }
});

publicRouter.get('/settings/logo/:name', (req, res, next) => {
  const name = path.basename(decodeURIComponent(req.params.name));
  const full = path.join(LOGO_DIR, name);
  try {
    if (!fs.statSync(full).isFile()) {
      res.status(404).end('Not found');
      return;
    }
  } catch {
    res.status(404).end('Not found');
    return;
  }
  res.setHeader('Content-Type', logoMime(name));
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  const { createReadStream } = require('fs');
  const stream = createReadStream(full);
  stream.on('error', next);
  stream.pipe(res);
});

module.exports = { publicRouter, adminRouter };