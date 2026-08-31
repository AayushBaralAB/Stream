'use strict';

const os = require('os');
const fs = require('fs');
const express = require('express');
const config = require('./config');

const router = express.Router();

function diskInfo() {
  const target = config.UPLOAD_DIR || config.ROOT;
  const fallback = { used: 0, total: 0, percent: 0, usedFormatted: '0 GB', totalFormatted: '0 GB' };
  try {
    if (typeof fs.statfs === 'function') {
      const s = fs.statfsSync(target);
      const total = s.blocks * s.bsize;
      const free = s.bfree * s.bsize;
      const used = Math.max(total - free, 0);
      const percent = total > 0 ? Math.round((used / total) * 100) : 0;
      return {
        used,
        total,
        percent,
        usedFormatted: formatBytes(used),
        totalFormatted: formatBytes(total),
      };
    }
  } catch {
    /* ignore and fall through */
  }
  return fallback;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function cpuLoadNow() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    for (const t of Object.values(cpu.times)) total += t;
    idle += cpu.times.idle;
  }
  return total > 0 ? Math.round((1 - idle / total) * 100) : 0;
}

function memInfo() {
  const total = os.totalmem();
  const used = total - os.freemem();
  const percent = total > 0 ? Math.round((used / total) * 100) : 0;
  return {
    used,
    total,
    percent,
    usedFormatted: formatBytes(used),
    totalFormatted: formatBytes(total),
  };
}

function heapInfo() {
  const mem = process.memoryUsage();
  return {
    used: mem.heapUsed,
    total: mem.heapTotal,
    percent: mem.heapTotal > 0 ? Math.round((mem.heapUsed / mem.heapTotal) * 100) : 0,
    usedFormatted: formatBytes(mem.heapUsed),
    totalFormatted: formatBytes(mem.heapTotal),
  };
}

router.get('/system/stats', async (_req, res, next) => {
  try {
    const { store } = require('./db');
    const { manager } = require('./ffmpeg');
    const activeStreams = manager.runningCount();
    const disk = diskInfo();
    const memory = memInfo();
    const heap = heapInfo();
    res.json({
      systemCpu: cpuLoadNow(),
      amsCpu: Math.max(cpuLoadNow() - 4, 0),
      dbAvgQueryTime: Math.round(store.avgQueryTime()),
      activeStreams,
      idealStreams: config.IDEAL_STREAMS,
      disk,
      memory,
      heap,
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------- health ------------------------------- */

async function healthHandler(_req, res, next) {
  try {
    const { manager } = require('./ffmpeg');
    const { store } = require('./db');
    const streams = await store.getStreams();
    const running = streams.filter((s) => s.status === 'running').length;
    const live = manager.runningCount();
    res.json({
      status: 'ok',
      uptime: Math.round(process.uptime()),
      engine: store.engine,
      ffmpeg: manager.isAvailable() ? 'available' : 'missing',
      streams: { total: streams.length, running, live },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { router, healthHandler, formatBytes };