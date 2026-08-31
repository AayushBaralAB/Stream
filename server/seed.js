'use strict';

/**
 * Seeds a demo video + stream on first boot (empty database only).
 * The demo video file ships with the repo under public/uploads and is also
 * copied into ./out/uploads during the build, so playback works everywhere.
 */

const fs = require('fs');
const path = require('path');
const config = require('./config');

const DEMO_FILENAME = '304383ed3f90d2d8b908001017b9bd3e.mp4';
const DEMO_THUMB_NAME = '304383ed3f90d2d8b908001017b9bd3e_thumb.jpg';

function demoFileCandidates() {
  return [
    path.join(config.UPLOAD_DIR, DEMO_FILENAME),
    path.join(config.ROOT, 'public', 'uploads', DEMO_FILENAME),
    path.join(config.ROOT, 'out', 'uploads', DEMO_FILENAME),
  ];
}

function findDemoVideoFile() {
  for (const candidate of demoFileCandidates()) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function seedIfEmpty(store) {
  const videos = await store.getVideos();
  const streams = await store.getStreams();
  if (videos.length > 0 || streams.length > 0) return false;

  // Copy the demo video into the upload directory so streams can use it.
  const source = findDemoVideoFile();
  if (!source) {
    console.warn('[seed] demo video file not found; skipping video seed');
    return false;
  }
  const dest = path.join(config.UPLOAD_DIR, DEMO_FILENAME);
  if (path.resolve(source) !== path.resolve(dest)) {
    fs.mkdirSync(config.UPLOAD_DIR, { recursive: true });
    fs.copyFileSync(source, dest);
  }

  const stat = fs.statSync(dest);
  const video = await store.insertVideo({
    filename: DEMO_FILENAME,
    original_name: 'Sample Stream Loop Video.mp4',
    file_path: `${config.BASE_PATH}/media/${DEMO_FILENAME}`,
    thumbnail_path: `${config.BASE_PATH}/api/thumbnails/${DEMO_THUMB_NAME.replace('_thumb.jpg', '')}_thumb.jpg`,
    duration: 0,
    file_size: stat.size,
    created_at: new Date().toISOString(),
  });

  const stream = await store.insertStream({
    name: 'Demo YouTube Stream',
    video_id: video.id,
    video_name: video.original_name,
    rtmp_url: 'rtmp://a.rtmp.youtube.com/live2/xxxx-xxxx-xxxx',
    quality: '720p',
    loop_enabled: true,
    status: 'stopped',
    started_at: null,
    error_message: null,
    created_at: new Date().toISOString(),
  });

  console.log(`[seed] seeded demo video #${video.id} and demo stream #${stream.id}`);
  return true;
}

module.exports = { seedIfEmpty, DEMO_FILENAME };