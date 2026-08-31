'use strict';

const multer = require('multer');

function corsNoCache(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
}

function notFound(req, res) {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.status(404).end('Not Found');
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'File is too large. Check MAX_FILE_SIZE.'
        : `Upload failed: ${err.message || err.code}`;
    res.status(400).json({ error: message });
    return;
  }
  if (err && err.status) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error('[error]', err);
  res.status(500).json({ error: 'Internal server error' });
}

module.exports = { corsNoCache, notFound, errorHandler };