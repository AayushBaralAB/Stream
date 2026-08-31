'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('./config');

const COOKIE_NAME = 'ab_session';
const router = express.Router();

let adminPasswordHash = config.ADMIN_PASSWORD_HASH;
let adminHashReady = null;

function ensureAdminHash() {
  if (adminPasswordHash) return Promise.resolve(adminPasswordHash);
  if (!config.ADMIN_PASSWORD) return null;
  if (!adminHashReady) {
    adminHashReady = bcrypt
      .hash(config.ADMIN_PASSWORD, 10)
      .then((h) => {
        adminPasswordHash = h;
        return h;
      })
      .catch(() => null);
  }
  return adminHashReady;
}

function cookieOptions(extra = {}) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.COOKIE_SECURE,
    maxAge: config.SESSION_TTL_SECONDS * 1000,
    path: '/',
    ...extra,
  };
}

function signToken(user) {
  return jwt.sign({ sub: user.username, iat: Math.floor(Date.now() / 1000) }, config.SESSION_SECRET, {
    expiresIn: config.SESSION_TTL_SECONDS,
  });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, config.SESSION_SECRET);
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  req.user = { username: payload.sub };
  next();
}

function readCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const pair of header.split(';')) {
    const idx = pair.indexOf('=');
    if (idx > 0) {
      out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
    }
  }
  return out;
}

router.use((req, res, next) => {
  req.cookies = req.cookies || readCookies(req);
  next();
});

router.post('/auth/login', async (req, res) => {
  const username = String(req.body?.username || '');
  const password = String(req.body?.password || '');

  const hash = await ensureAdminHash();
  if (!hash) {
    res.status(500).json({
      error:
        'Administrator credentials are not configured. Set ADMIN_PASSWORD or ADMIN_PASSWORD_HASH in the server .env.',
    });
    return;
  }
  if (username !== config.ADMIN_USERNAME || !password) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }
  const ok = await bcrypt.compare(password, hash).catch(() => false);
  if (!ok) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }
  res.cookie(COOKIE_NAME, signToken({ username }), cookieOptions());
  res.json({ success: true, user: { isLoggedIn: true, username } });
});

router.post('/auth/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, cookieOptions({ maxAge: 0 }));
  res.json({ success: true });
});

router.get('/auth/session', (req, res) => {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  res.json({ success: true, user: { isLoggedIn: true, username: payload.sub } });
});

module.exports = { router, requireAuth, COOKIE_NAME, signToken, verifyToken };