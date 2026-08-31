'use strict';

/**
 * Serves the static export (./out) produced by `next build` and injects the
 * `window.__AB_LIVE__` flag that tells the frontend a real API is available
 * (so the browser mock backend is not activated).
 *
 * Handles Next.js static-export URL mapping: /dashboard -> dashboard.html,
 * and 404.html if present.
 */

const fs = require('fs');
const path = require('path');
const express = require('express');

const PAGE_MAP = {
  '/': 'index.html',
  '/dashboard': 'dashboard.html',
  '/streams': 'streams.html',
  '/streams/': 'streams.html',
  '/videos': 'videos.html',
  '/videos/': 'videos.html',
  '/settings': 'settings.html',
  '/settings/': 'settings.html',
  '/auth/login': 'auth/login.html',
};

const INJECT = '<script>window.__AB_LIVE__=true;</script>';

function staticRouter(outDir) {
  const router = express.Router();

  router.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.status(405).setHeader('Allow', 'GET, HEAD').end();
      return;
    }

    let urlPath;
    try {
      urlPath = decodeURIComponent(req.path);
    } catch {
      res.status(400).end('Bad Request');
      return;
    }

    if (/\.\./.test(urlPath)) {
      res.status(403).end('Forbidden');
      return;
    }

    if (urlPath === '/' || urlPath === '') urlPath = '/';

    const file = PAGE_MAP[urlPath] || urlPath.replace(/^\/+/, '');
    const abs = path.join(outDir, file);
    const resolved = path.resolve(abs);
    if (!resolved.startsWith(path.resolve(outDir) + path.sep) && resolved !== path.resolve(outDir)) {
      res.status(403).end('Forbidden');
      return;
    }

    let content = null;
    let type = null;
    let status = 200;
    const candidates = [resolved, `${resolved}.html`, path.join(resolved, 'index.html')];
    if (/\.html$/.test(file)) candidates.unshift(path.join(outDir, file.replace(/\.html$/, ''), 'index.html'));
    for (const candidate of candidates) {
      try {
        if (fs.statSync(candidate).isFile()) {
          content = fs.readFileSync(candidate);
          if (urlPath === '/' || candidate.endsWith('.html')) type = 'text/html';
          else if (candidate.endsWith('.css')) type = 'text/css';
          else if (candidate.endsWith('.js')) type = 'application/javascript';
          else if (candidate.endsWith('.svg')) type = 'image/svg+xml';
          else if (candidate.endsWith('.json')) type = 'application/json';
          else if (candidate.endsWith('.ico')) type = 'image/x-icon';
          else if (candidate.endsWith('.png')) type = 'image/png';
          else if (candidate.endsWith('.jpg') || candidate.endsWith('.jpeg')) type = 'image/jpeg';
          else if (candidate.endsWith('.webp')) type = 'image/webp';
          else if (candidate.endsWith('.woff2')) type = 'font/woff2';
          else type = 'application/octet-stream';
          break;
        }
      } catch {
        /* try next candidate */
      }
    }

    if (content === null) {
      const notFound = path.join(outDir, '404.html');
      try {
        if (fs.statSync(notFound).isFile()) {
          content = fs.readFileSync(notFound);
          type = 'text/html';
        } else {
          res.status(404).setHeader('Content-Type', 'text/plain; charset=utf-8').end('Not Found');
          return;
        }
      } catch {
        res.status(404).setHeader('Content-Type', 'text/plain; charset=utf-8').end('Not Found');
        return;
      }
      status = 404;
    }

    if (type === 'text/html') {
      const raw = content.toString('utf8');
      const injected = injectFlag(raw);
      if (injected !== raw) content = Buffer.from(injected, 'utf8');
    }

    if (file.startsWith('_next')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }

    res.status(status);
    res.setHeader('Content-Type', type || 'application/octet-stream');
    res.setHeader('Content-Length', content.length);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'HEAD') {
      res.end();
    } else {
      res.end(content);
    }
  });

  return router;
}

function injectFlag(html) {
  if (html.includes('__AB_LIVE__')) return html;
  const headEnd = html.indexOf('</head>');
  if (headEnd === -1) return html;
  return html.slice(0, headEnd) + INJECT + html.slice(headEnd);
}

module.exports = { staticRouter };