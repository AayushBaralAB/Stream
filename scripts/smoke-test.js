'use strict';

/**
 * Smoke test for the production server (server/index.js).
 *
 * Verifies end-to-end behavior with a REAL FFmpeg binary and a file-backed
 * JSON store (Mongo is not required locally):
 *   - public health + settings endpoints
 *   - auth required on protected APIs, login/logout works
 *   - video upload writes a real file to UPLOAD_DIR + metadata row
 *   - Range serving of /media files
 *   - stream create/update (placeholder key rejected)
 *   - TCP preflight rejects unreachable RTMP targets before launching ffmpeg
 *   - starting a stream connects to a local fake RTMP endpoint, persists
 *     "running", and exposes real ffmpeg stats; stop() ends the process
 *   - a target that accepts TCP but kills the connection exercises the
 *     watchdog: auto-retries, then persists status "error" with a message
 *
 * Run: npm run smoke
 */

const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = Number(process.env.SMOKE_PORT || 34123);
const BASE = `http://127.0.0.1:${PORT}`;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-smoke-'));
const UPLOAD_DIR = path.join(TMP, 'uploads');
const DATA_DIR = path.join(TMP, 'data');

const HOLD_RTMP_PORT = Number(process.env.SMOKE_HOLD_PORT || 34124); // accepts, stays open
const DESTROY_RTMP_PORT = Number(process.env.SMOKE_DESTROY_PORT || 34126); // accepts then destroys
const DEAD_PORT = Number(process.env.SMOKE_DEAD_PORT || 34125); // no listener

let serverProc = null;
let cookie = null;
let passed = 0;
let failed = 0;
const errors = [];

function check(name, ok, extra) {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    errors.push({ name, extra });
    console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`);
  }
}

async function api(method, url, { body, headers = {} } = {}) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: {
      ...(body && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body,
    redirect: 'manual',
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, headers: res.headers, data };
}

function readCookie(res) {
  const setCookie = res.headers.get('set-cookie') || '';
  const m = /ab_session=([^;]+)/.exec(setCookie);
  return m ? `ab_session=${m[1]}` : null;
}

function waitFor(fn, timeoutMs, intervalMs = 300) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(async () => {
      let ok = false;
      try {
        ok = await fn();
      } catch {
        ok = false;
      }
      if (ok) {
        clearInterval(timer);
        resolve(true);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`timed out after ${timeoutMs}ms`));
      }
    }, intervalMs);
  });
}

function listen(port, mode) {
  const server = net.createServer((socket) => {
    socket.on('error', () => {});
    if (mode === 'destroy') {
      setTimeout(() => socket.destroy(), 50);
    } else {
      socket.setTimeout(4000);
      socket.on('timeout', () => socket.destroy());
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

(async () => {
  console.log(`[smoke] temp dir: ${TMP}`);
  console.log(`[smoke] rtmp hold=:${HOLD_RTMP_PORT} destroy=:${DESTROY_RTMP_PORT} dead=:${DEAD_PORT}`);

  const holdServer = await listen(HOLD_RTMP_PORT, 'hold');
  const destroyServer = await listen(DESTROY_RTMP_PORT, 'destroy');

  serverProc = spawn(process.execPath, ['server/index.js'], {
    env: {
      ...process.env,
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: String(PORT),
      BASE_PATH: '',
      SESSION_SECRET: 'smoke-test-secret-not-for-production-0123456789',
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD: 'smoke-password',
      ADMIN_PASSWORD_HASH: '',
      MONGODB_URI: '',
      UPLOAD_DIR,
      DATA_DIR,
      FFMPEG_MAX_RESTARTS: '1',
      FFMPEG_RESTART_DELAY_MS: '300',
      WATCHDOG_INTERVAL_MS: '300',
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  serverProc.on('exit', (code) => {
    // code null = terminated by our own SIGTERM at shutdown.
    if (code !== 0 && code !== null) {
      console.error(`[smoke] server exited early (code ${code})`);
      process.exit(1);
    }
  });

  await waitFor(() => api('GET', '/api/health').then((r) => r.status === 200), 30000);

  console.log('\n[1] health + auth');
  const health = await api('GET', '/api/health');
  check('health is public (200)', health.status === 200 && health.data.status === 'ok');
  check('health reports ffmpeg available', health.data.ffmpeg === 'available', `got ${health.data.ffmpeg}`);

  const unauth = await api('GET', '/api/videos/list');
  check('videos list requires auth (401)', unauth.status === 401, `got ${unauth.status}`);

  const badLogin = await api('POST', '/api/auth/login', { body: JSON.stringify({ username: 'admin', password: 'wrong' }) });
  check('wrong password rejected (401)', badLogin.status === 401);

  const login = await api('POST', '/api/auth/login', { body: JSON.stringify({ username: 'admin', password: 'smoke-password' }) });
  cookie = readCookie(login);
  check('login succeeds (200 + cookie)', login.status === 200 && !!cookie);

  console.log('\n[2] seed data');
  const videos1 = await api('GET', '/api/videos/list', { headers: { cookie } });
  check('seed demo video present', videos1.status === 200 && videos1.data.videos.length >= 1);
  const seedVideo = videos1.data.videos[0];
  check('seed video media path is /media/*', String(seedVideo.file_path).startsWith('/media/'), seedVideo.file_path);

  console.log('\n[3] upload to disk');
  const fakeMp4 = Buffer.concat([
    Buffer.from(
      '00000018667479706d703432000000006d70343269736f6d0000000000000000' +
        '6d64617400000000',
      'hex',
    ),
    Buffer.alloc(2048, 0x47),
  ]);
  const fd = new FormData();
  fd.append('file', new Blob([fakeMp4], { type: 'video/mp4' }), 'smoke-upload.mp4');
  const uploadRes = await api('POST', '/api/videos/upload', { body: fd, headers: { cookie } });
  const uploaded = uploadRes.data?.video;
  check('upload returns 200 + video', uploadRes.status === 200 && !!uploaded, JSON.stringify(uploadRes.data));
  const uploadedFile = path.join(UPLOAD_DIR, uploaded.filename);
  check('file written to UPLOAD_DIR', fs.existsSync(uploadedFile) && fs.statSync(uploadedFile).size === fakeMp4.length, uploaded.filename);

  const videos2 = await api('GET', '/api/videos/list', { headers: { cookie } });
  check('list contains uploaded video', videos2.data.videos.some((v) => v.id === uploaded.id));

  console.log('\n[4] media Range serving');
  const range = await fetch(`${BASE}/media/${uploaded.filename}`, { headers: { cookie, Range: 'bytes=0-99' } });
  check('range request returns 206', range.status === 206, `got ${range.status}`);
  const firstBytes = Buffer.from(await range.arrayBuffer());
  check('range returns 100 bytes', firstBytes.length === 100);

  console.log('\n[5] streams: create / validation');
  // Stream from the real seeded demo video (uploaded test bytes are not decodable by ffmpeg).
  const streamBase = { name: 'Smoke 24/7 Stream', videoId: seedVideo.id, quality: '720p', loopEnabled: true };
  const createRes = await api('POST', '/api/streams/create', {
    body: JSON.stringify({ ...streamBase, rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2/aaaa-bbbb-cccc-dddd' }),
    headers: { cookie },
  });
  const newStream = createRes.data?.stream;
  check('stream created', createRes.status === 200 && !!newStream && newStream.status === 'stopped');

  const dupCreate = await api('POST', '/api/streams/create', {
    body: JSON.stringify({ ...streamBase, rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2/aaaa-bbbb-cccc-dddd' }),
    headers: { cookie },
  });
  check('duplicate create allowed (cleanup dedupes)', dupCreate.status === 200);

  const cleanup = await api('POST', '/api/streams/cleanup', { headers: { cookie } });
  check('cleanup removes duplicates', /1 duplicate/.test(cleanup.data.message || ''), JSON.stringify(cleanup.data));

  const badKeyRes = await api('POST', '/api/streams/create', {
    body: JSON.stringify({ ...streamBase, name: 'Bad key', rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2/xxxx-xxxx-xxxx' }),
    headers: { cookie },
  });
  check('placeholder key rejected on create', badKeyRes.status === 400, `got ${badKeyRes.status}`);

  console.log('\n[6] start: TCP preflight rejects unreachable target');
  const updateDead = await api('PUT', `/api/streams/${newStream.id}/update`, {
    body: JSON.stringify({ ...streamBase, rtmpUrl: `rtmp://127.0.0.1:${DEAD_PORT}/live/smoke-dead` }),
    headers: { cookie },
  });
  check('update stream (dead target)', updateDead.status === 200);

  const deadResp = await api('POST', '/api/streams/start', { body: JSON.stringify({ streamId: newStream.id }), headers: { cookie } });
  check('start fails fast when RTMP host unreachable', deadResp.status === 400 && /Cannot reach/.test(deadResp.data?.error || ''), `got ${deadResp.status}: ${JSON.stringify(deadResp.data)}`);
  const listAfterDead = (await api('GET', '/api/streams/list', { headers: { cookie } })).data.streams.find((s) => s.id === newStream.id);
  check('stream stays stopped after failed preflight', listAfterDead.status === 'stopped');

  console.log('\n[7] start: real ffmpeg against local fake RTMP');
  const updateHold = await api('PUT', `/api/streams/${newStream.id}/update`, {
    body: JSON.stringify({ ...streamBase, rtmpUrl: `rtmp://127.0.0.1:${HOLD_RTMP_PORT}/live/smoke-live` }),
    headers: { cookie },
  });
  check('update stream (hold RTMP)', updateHold.status === 200);

  const startRes = await api('POST', '/api/streams/start', { body: JSON.stringify({ streamId: newStream.id }), headers: { cookie } });
  check('start returns connected', startRes.status === 200 && startRes.data.connected === true, `got ${startRes.status}: ${JSON.stringify(startRes.data)}`);

  await waitFor(
    () => api('GET', '/api/streams/list', { headers: { cookie } }).then((r) => r.data.streams.find((s) => s.id === newStream.id)?.status === 'running'),
    8000,
  );
  const afterStart = (await api('GET', '/api/streams/list', { headers: { cookie } })).data.streams.find((s) => s.id === newStream.id);
  check('stream persisted as running', afterStart.status === 'running', `status=${afterStart.status}`);
  check('running stream has started_at', !!afterStart.started_at);

  const statsRes = await api('GET', `/api/streams/stats?streamId=${newStream.id}`, { headers: { cookie } });
  check('live stats endpoint returns real ffmpeg stats', statsRes.status === 200 && statsRes.data.errors.length === 0, JSON.stringify(statsRes.data));

  const aggRes = await api('GET', '/api/streams/stats', { headers: { cookie } });
  check('aggregate stats shape', aggRes.status === 200 && typeof aggRes.data.averages.avgBitrate === 'number' && typeof aggRes.data.summary.totalStreams === 'number', JSON.stringify(aggRes.data));

  const dash = await api('GET', '/api/streams/dashboard-status', { headers: { cookie } });
  check('dashboard-status activeCount >= 1', dash.data.activeCount >= 1, JSON.stringify(dash.data));

  console.log('\n[8] stop');
  const stopRes = await api('POST', '/api/streams/stop', { body: JSON.stringify({ streamId: newStream.id }), headers: { cookie } });
  check('stop succeeds', stopRes.status === 200);
  await waitFor(
    () => api('GET', '/api/streams/list', { headers: { cookie } }).then((r) => r.data.streams.find((s) => s.id === newStream.id)?.status === 'stopped'),
    8000,
  );
  const afterStop = (await api('GET', '/api/streams/list', { headers: { cookie } })).data.streams.find((s) => s.id === newStream.id);
  check('stopped after API stop', afterStop.status === 'stopped' && afterStop.started_at === null);

  console.log('\n[9] watchdog: TCP ok but connection reset -> error');
  const updateBroken = await api('PUT', `/api/streams/${newStream.id}/update`, {
    body: JSON.stringify({ ...streamBase, rtmpUrl: `rtmp://127.0.0.1:${DESTROY_RTMP_PORT}/live/smoke-broken` }),
    headers: { cookie },
  });
  check('update stream (reset RTMP)', updateBroken.status === 200);

  const failingStart = await api('POST', '/api/streams/start', { body: JSON.stringify({ streamId: newStream.id }), headers: { cookie } });
  check('preflight passes (ffmpeg must fail at runtime)', failingStart.status === 200, `got ${failingStart.status}: ${JSON.stringify(failingStart.data)}`);

  let terminal = null;
  await waitFor(
    async () => {
      const list = await api('GET', '/api/streams/list', { headers: { cookie } });
      const s = list.data.streams.find((x) => x.id === newStream.id);
      if (s && s.status !== 'running') {
        terminal = s;
        return true;
      }
      return false;
    },
    30000,
  ).catch(() => false);
  check('watchdog stopped retrying and marked error', terminal && terminal.status === 'error', JSON.stringify(terminal || 'none'));
  check('error_message captured from ffmpeg', !!terminal?.error_message, `message: ${terminal?.error_message}`);

  console.log('\n[10] delete + settings');
  const delRes = await api('DELETE', `/api/streams/${newStream.id}/delete`, { headers: { cookie } });
  check('delete stream', delRes.status === 200);
  const delVideoRes = await api('DELETE', `/api/videos/${uploaded.id}/delete`, { headers: { cookie } });
  check('delete video', delVideoRes.status === 200);
  check('uploaded file removed from disk', !fs.existsSync(uploadedFile));

  const settingsGet = await api('GET', '/api/settings');
  check('settings public (200)', settingsGet.status === 200 && settingsGet.data.settings.appName.length > 0);

  const syncRes = await api('POST', '/api/streams/sync-status', { headers: { cookie } });
  check('sync-status', syncRes.status === 200);

  console.log('\n[11] logout');
  const logout = await api('POST', '/api/auth/logout', { headers: { cookie } });
  check('logout', logout.status === 200);

  holdServer.close();
  destroyServer.close();

  console.log('');
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  serverProc.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 1500));
  fs.rmSync(TMP, { recursive: true, force: true });
  if (failed > 0) {
    console.error('\nFailures:');
    for (const e of errors) console.error(`  - ${e.name}${e.extra ? `\n      ${e.extra}` : ''}`);
    process.exit(1);
  }
  process.exit(0);
})().catch((err) => {
  console.error('[smoke] fatal', err);
  if (serverProc) serverProc.kill('SIGKILL');
  process.exit(1);
});