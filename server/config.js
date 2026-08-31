'use strict';

const path = require('path');

require('dotenv').config();

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';
const ROOT = path.join(__dirname, '..');

const config = {
  ROOT,
  NODE_ENV,
  isProd,
  HOST: process.env.HOST || '0.0.0.0',
  PORT: Number(process.env.PORT || 3000),
  BASE_PATH: (process.env.BASE_PATH || '').replace(/\/+$/, ''),
  TZ: process.env.TZ || 'Asia/Kathmandu',
  SESSION_SECRET: process.env.SESSION_SECRET || '',
  SESSION_TTL_SECONDS: Number(process.env.SESSION_TTL_SECONDS || 60 * 60 * 24 * 7),
  COOKIE_SECURE: process.env.COOKIE_SECURE === '1' || process.env.COOKIE_SECURE === 'true' || isProd,
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'admin',
  ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH || '',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
  MONGODB_URI: process.env.MONGODB_URI || '',
  MONGODB_DB: process.env.MONGODB_DB || 'ab_streaming',
  UPLOAD_DIR: path.resolve(ROOT, process.env.UPLOAD_DIR || (isProd ? '/data/uploads' : 'uploads')),
  MAX_FILE_SIZE: Number(process.env.MAX_FILE_SIZE || 2 * 1024 * 1024 * 1024),
  DATA_DIR: path.resolve(ROOT, process.env.DATA_DIR || 'data'),
  FFMPEG_PATH: process.env.FFMPEG_PATH || 'ffmpeg',
  FFMPEG_MAX_RESTARTS: Number(process.env.FFMPEG_MAX_RESTARTS || 6),
  FFMPEG_RESTART_DELAY_MS: Number(process.env.FFMPEG_RESTART_DELAY_MS || 5000),
  IDEAL_STREAMS: Number(process.env.IDEAL_STREAMS || 4),
  WATCHDOG_INTERVAL_MS: Number(process.env.WATCHDOG_INTERVAL_MS || 3000),
};

if (config.TZ) {
  process.env.TZ = config.TZ;
}

module.exports = config;