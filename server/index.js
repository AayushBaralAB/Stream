'use strict';

/**
 * AB Streaming Software — production server.
 *
 * Serves the static Next.js export (./out) plus the real REST API under
 * /api/*  (upload videos to disk, manage streams, run FFmpeg on the server).
 *
 * Start:  npm run start   (or  node server/index.js)
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const config = require('./config');

const { init: initStore, store } = require('./db');
const { manager } = require('./ffmpeg');
const { seedIfEmpty } = require('./seed');
const auth = require('./auth');
const videos = require('./videos');
const streams = require('./streams');
const settings = require('./settings');
const dashboard = require('./dashboard');
const { staticRouter } = require('./static');
const { corsNoCache, notFound, errorHandler } = require('./middleware');

const OUT_DIR = path.join(config.ROOT, 'out');

function reqLogger(req, res, next) {
  if (req.path.startsWith('/api/')) {
    const start = Date.now();
    res.on('finish', () => {
      if (res.statusCode >= 400 || req.path !== '/api/streams/list') {
        console.log(`[http] ${req.method} ${req.path} -> ${res.statusCode} (${Date.now() - start}ms)`);
      }
    });
  }
  next();
}

function cookieParser(req, _res, next) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const pair of header.split(';')) {
    const idx = pair.indexOf('=');
    if (idx > 0) {
      out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
    }
  }
  req.cookies = out;
  next();
}

async function main() {
  fs.mkdirSync(config.UPLOAD_DIR, { recursive: true });
  fs.mkdirSync(config.DATA_DIR, { recursive: true });

  await initStore();
  console.log(`[db] engine: ${store.engine}`);

  await seedIfEmpty(store);

  manager.store = store;
  manager.findVideoFile = async (stream) => {
    const video = await store.getVideo(stream.video_id).catch(() => null);
    if (!video) return null;
    const full = path.join(config.UPLOAD_DIR, path.basename(video.filename));
    try {
      return fs.statSync(full).isFile() ? full : null;
    } catch {
      return null;
    }
  };

  const available = await manager.init();
  console.log(`[ffmpeg] ${available ? `available at ${manager.ffmpegPath}` : 'NOT FOUND — streams will fail to start'}`);

  if (!config.SESSION_SECRET) {
    console.warn('[auth] SESSION_SECRET is empty — set a random value in the server .env.');
  }
  if (available) {
    console.log(
      `[ffmpeg] watchdog: every ${config.WATCHDOG_INTERVAL_MS}ms, max ${config.FFMPEG_MAX_RESTARTS} restarts`,
    );
  }

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(corsNoCache);
  app.use(cookieParser);
  app.use(reqLogger);
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use('/media', auth.requireAuth, videos.mediaRouter);
  app.use('/api', auth.router);
  app.get('/api/health', dashboard.healthHandler);
  app.use('/api', settings.publicRouter);
  app.use('/api', auth.requireAuth, videos.router);
  app.use('/api', auth.requireAuth, streams.router);
  app.use('/api', auth.requireAuth, settings.adminRouter);
  app.use('/api', auth.requireAuth, dashboard.router);

  app.use('/', staticRouter(OUT_DIR));
  app.use(notFound);
  app.use(errorHandler);

  const server = http.createServer(app);

  const watchdog = setInterval(() => {
    manager.tick().catch((err) => console.error('[watchdog]', err));
  }, config.WATCHDOG_INTERVAL_MS);
  watchdog.unref();

  server.listen(config.PORT, config.HOST, () => {
    console.log(`[server] listening on http://${config.HOST}:${config.PORT}`);
    console.log(`[server] uploads: ${config.UPLOAD_DIR}`);
  });

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[server] ${signal} received — shutting down...`);
    clearInterval(watchdog);
    try {
      await manager.shutdown();
    } catch {
      /* ignore */
    }
    await store.close().catch(() => {});
    server.close(() => {
      console.log('[server] bye');
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});