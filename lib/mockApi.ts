import axios, { AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { isIdbAvailable, saveBlob, getBlob, removeBlob } from './idb';
import { withBase } from './basePath';

/* ------------------------------------------------------------------ *
 *  Browser demo backend.
 *  Intercepts every axios request to `/api/...` and serves a mock,
 *  persisted in localStorage (with video blobs stored in IndexedDB).
 *  This lets the full UI run on a static host such as GitHub Pages.
 * ------------------------------------------------------------------ */

interface MockVideo {
  id: number;
  filename: string;
  original_name: string;
  file_path: string;
  thumbnail_path?: string | null;
  duration?: number;
  file_size: number;
  created_at: string;
  storage?: 'static' | 'idb';
}

interface MockStream {
  id: number;
  name: string;
  video_id: number;
  video_name: string;
  rtmp_url: string;
  quality: string;
  loop_enabled: boolean;
  status: 'running' | 'stopped' | 'error';
  started_at: string | null;
  error_message: string | null;
  created_at: string;
}

interface MockSettings {
  appName: string;
  logoPath?: string | null;
}

interface MockDb {
  settings: MockSettings;
  videos: MockVideo[];
  streams: MockStream[];
}

const DB_KEY = 'ab-streaming-demo-db';
const SESSION_KEY = 'streaming-app-session';

let objectUrls = new Map<string, string>();

/* ------------------------------ storage ------------------------------ */

function readDb(): MockDb {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MockDb;
      if (parsed && Array.isArray(parsed.videos) && Array.isArray(parsed.streams)) {
        return parsed;
      }
    }
  } catch {
    /* ignore */
  }
  return seedDb();
}

function writeDb(db: MockDb): void {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    /* storage may be full; keep in-memory state */
  }
}

function seedDb(): MockDb {
  const now = Date.now();
  return {
    settings: {
      appName: 'AB Streaming Software',
      logoPath: withBase('/uploads/app-logo.svg'),
    },
    videos: [
      {
        id: 1,
        filename: '304383ed3f90d2d8b908001017b9bd3e.mp4',
        original_name: 'Sample Stream Loop Video.mp4',
        file_path: withBase('/uploads/304383ed3f90d2d8b908001017b9bd3e.mp4'),
        thumbnail_path: withBase('/uploads/thumbnails/304383ed3f90d2d8b908001017b9bd3e_thumb.jpg'),
        duration: 0,
        file_size: 42_317_088,
        created_at: new Date(now - 1000 * 60 * 60 * 24 * 5).toISOString(),
        storage: 'static',
      },
    ],
    streams: [
      {
        id: 1,
        name: 'Demo YouTube Stream',
        video_id: 1,
        video_name: 'Sample Stream Loop Video.mp4',
        rtmp_url: 'rtmp://a.rtmp.youtube.com/live2/xxxx-xxxx-xxxx',
        quality: '720p',
        loop_enabled: true,
        status: 'running',
        started_at: new Date(now - 1000 * 60 * 60).toISOString(),
        error_message: null,
        created_at: new Date(now - 1000 * 60 * 60 * 24).toISOString(),
      },
    ],
  };
}

/* --------------------------- child assertions ------------------------ */

function num(body: unknown, key: string, fallback: number): number {
  const v = (body as Record<string, unknown>)?.[key];
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return fallback;
}

function str(body: unknown, key: string, fallback = ''): string {
  const v = (body as Record<string, unknown>)?.[key];
  return typeof v === 'string' ? v : fallback;
}

function bool(body: unknown, key: string, fallback = false): boolean {
  const v = (body as Record<string, unknown>)?.[key];
  return typeof v === 'boolean' ? v : fallback;
}

/* ------------------------------ helpers ------------------------------ */

function jsonResponse(data: unknown, status = 200): AxiosResponse {
  return {
    data,
    status,
    statusText: status === 200 ? 'OK' : 'OK',
    headers: { 'content-type': 'application/json' },
    config: {} as AxiosRequestConfig,
    request: {},
  } as AxiosResponse;
}

function parseUrl(url: string): { path: string; params: URLSearchParams } {
  const qIdx = url.indexOf('?');
  const path = qIdx >= 0 ? url.slice(0, qIdx) : url;
  const query = qIdx >= 0 ? url.slice(qIdx + 1) : '';
  return { path, params: new URLSearchParams(query) };
}

async function resolveVideoUrls(videos: MockVideo[]): Promise<MockVideo[]> {
  return Promise.all(
    videos.map(async (video) => {
      if (video.storage !== 'idb') return video;
      let url = objectUrls.get(video.filename);
      if (!url) {
        const blob = await getBlob(video.filename).catch(() => null);
        if (blob) {
          url = URL.createObjectURL(blob);
          objectUrls.set(video.filename, url);
        }
      }
      return { ...video, file_path: url || video.file_path };
    }),
  );
}

function simulatedStreamStats(stream: MockStream): {
  bitrate: number;
  fps: number;
  speed: number;
  quality: 'excellent' | 'good' | 'fair' | 'poor';
  errors: string[];
} {
  const base = stream.quality === '1080p' ? 3500 : 2000;
  const tick = Math.floor(Date.now() / 2000);
  const wiggle = Math.sin((stream.id * 13 + tick) * 0.9) * 60;
  const speed = 0.99 + Math.abs(Math.sin(stream.id * 7 + tick * 0.4)) * 0.03;
  return {
    bitrate: Math.round(base + wiggle),
    fps: 29.6 + Math.abs(Math.sin(stream.id * 3 + tick)) * 0.4,
    speed: Number(speed.toFixed(3)),
    quality: speed > 0.98 && speed < 1.02 ? 'excellent' : 'good',
    errors: [],
  };
}

/* --------------------------- thumbnail route ------------------------- */

async function thumbRoute(filenameWithExt: string): Promise<AxiosResponse> {
  const name = filenameWithExt.replace(/_thumb\.[a-zA-Z0-9]+$/, '');
  const real = withBase(`/uploads/thumbnails/${name}_thumb.jpg`);
  try {
    const res = await fetch(real);
    if (res.ok) {
      const blob = await res.blob();
      return {
        data: blob,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': blob.type || 'image/jpeg' },
        config: {} as AxiosRequestConfig,
        request: {},
      } as AxiosResponse;
    }
  } catch {
    /* fall through to placeholder */
  }
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">' +
    '<rect width="100%" height="100%" fill="#262626"/>' +
    '<circle cx="320" cy="160" r="52" fill="none" stroke="#525252" stroke-width="14"/>' +
    '<path d="M300 132l52 28-52 28z" fill="#a3a3a3"/>' +
    '<text x="320" y="270" font-family="Arial" font-size="22" fill="#737373" text-anchor="middle">No thumbnail</text>' +
    '</svg>';
  return jsonResponse(new Blob([svg], { type: 'image/svg+xml' }));
}

/* ------------------------------ route table -------------------------- */

async function dispatch(config: AxiosRequestConfig): Promise<AxiosResponse> {
  const method = (config.method || 'get').toUpperCase();
  const { path, params } = parseUrl(String(config.url || ''));
  const db = readDb();
  let body: unknown = config.data;
  if (typeof body === 'string' && body.trim() !== '') {
    const trimmed = body.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        body = JSON.parse(trimmed);
      } catch {
        /* keep raw string */
      }
    }
  }

  if (!path.startsWith('/api/')) {
    throw new Error(`Mock adapter only handles /api/* requests (got ${path})`);
  }

  /* ------------------------------ settings -------------------------- */
  if (method === 'GET' && path === '/api/settings') {
    return jsonResponse({ settings: db.settings });
  }
  if (method === 'POST' && path === '/api/settings') {
    if (body instanceof FormData) {
      const appName = str(body.get('appName'), 'name', db.settings.appName);
      const logoFile = body.get('logo') as File | null;
      if (appName) db.settings.appName = appName;
      if (logoFile && logoFile instanceof File) {
        db.settings.logoPath = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(logoFile);
        });
      }
    }
    writeDb(db);
    return jsonResponse({ success: true, settings: db.settings });
  }

  /* ------------------------------- auth ------------------------------ */
  if (method === 'POST' && path === '/api/auth/login') {
    const username = str(body, 'username');
    const password = str(body, 'password');
    if (username !== 'admin' || password !== 'admin') {
      return jsonResponse({ error: 'Invalid credentials' }, 401);
    }
    try {
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ user: { isLoggedIn: true, username } }),
      );
    } catch {
      /* ignore */
    }
    return jsonResponse({ success: true, user: { isLoggedIn: true, username } });
  }
  if (method === 'POST' && path === '/api/auth/logout') {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
    return jsonResponse({ success: true });
  }

  /* ------------------------------- videos ---------------------------- */
  if (method === 'GET' && path === '/api/videos/list') {
    const videos = await resolveVideoUrls(db.videos);
    return jsonResponse({ videos });
  }
  if (method === 'POST' && path === '/api/videos/upload') {
    const fd = body as FormData;
    const file = fd.get('file') as File | null;
    if (!file) {
      return jsonResponse({ error: 'No file provided' }, 400);
    }
    const id = Math.max(0, ...db.videos.map((v) => v.id)) + 1;
    const filename = `demo-${Date.now()}.${file.name.split('.').pop() || 'mp4'}`;
    const video: MockVideo = {
      id,
      filename,
      original_name: file.name,
      file_path: '',
      thumbnail_path: null,
      file_size: file.size,
      created_at: new Date().toISOString(),
      storage: 'idb',
    };
    db.videos.unshift(video);
    writeDb(db);
    if (isIdbAvailable()) {
      await saveBlob(filename, file).catch(() => {
        /* if Idb fails, still list the entry without playback */
      });
    }
    const [resolved] = await resolveVideoUrls([video]);
    return jsonResponse({ success: true, video: resolved });
  }
  if (method === 'POST' && path === '/api/videos/reorder') {
    const ids = Array.isArray(body) ? (body as number[]) : [];
    const byId = new Map(db.videos.map((v) => [v.id, v]));
    const ordered: MockVideo[] = [];
    for (const id of ids) {
      const v = byId.get(id);
      if (v) ordered.push(v);
    }
    for (const v of db.videos) {
      if (!ordered.includes(v)) ordered.push(v);
    }
    db.videos = ordered;
    writeDb(db);
    return jsonResponse({ success: true });
  }
  const videoDeleteMatch = path.match(/^\/api\/videos\/(\d+)\/delete$/);
  if (method === 'DELETE' && videoDeleteMatch) {
    const id = Number(videoDeleteMatch[1]);
    const removed = db.videos.find((v) => v.id === id);
    db.videos = db.videos.filter((v) => v.id !== id);
    db.streams = db.streams.filter((s) => s.video_id !== id);
    writeDb(db);
    if (removed?.storage === 'idb') {
      const url = objectUrls.get(removed.filename);
      if (url) {
        URL.revokeObjectURL(url);
        objectUrls.delete(removed.filename);
      }
      removeBlob(removed.filename).catch(() => {
        /* ignore */
      });
    }
    return jsonResponse({ success: true });
  }

  /* ------------------------------- streams --------------------------- */
  if (method === 'GET' && path === '/api/streams/list') {
    return jsonResponse({ streams: db.streams });
  }
  if (method === 'POST' && path === '/api/streams/create') {
    const name = str(body, 'name').trim();
    const videoId = num(body, 'videoId', 0);
    const rtmpUrl = str(body, 'rtmpUrl').trim();
    if (!name || !videoId || !rtmpUrl) {
      return jsonResponse({ error: 'Name, video and RTMP URL are required' }, 400);
    }
    const video = db.videos.find((v) => v.id === videoId);
    const id = Math.max(0, ...db.streams.map((s) => s.id)) + 1;
    const stream: MockStream = {
      id,
      name,
      video_id: videoId,
      video_name: video?.original_name || '',
      rtmp_url: rtmpUrl,
      quality: str(body, 'quality', '720p'),
      loop_enabled: bool(body, 'loopEnabled', true),
      status: 'stopped',
      started_at: null,
      error_message: null,
      created_at: new Date().toISOString(),
    };
    db.streams.push(stream);
    writeDb(db);
    return jsonResponse({ success: true, stream });
  }
  if (method === 'POST' && path === '/api/streams/start') {
    const streamId = num(body, 'streamId', -1);
    const stream = db.streams.find((s) => s.id === streamId);
    if (!stream) {
      return jsonResponse({ error: 'Stream not found' }, 404);
    }
    const rtmp = stream.rtmp_url || '';
    const slash = rtmp.lastIndexOf('/');
    const server = slash > 0 ? rtmp.slice(0, slash) : rtmp;
    const streamKey = (slash >= 0 ? rtmp.slice(slash + 1) : '').trim();
    const isPlaceholder = streamKey.toLowerCase().includes('xxxx');
    if (!streamKey || streamKey.length < 6 || isPlaceholder || /\s/.test(streamKey)) {
      return jsonResponse(
        {
          error: `Cannot connect "${stream.name}" using "${streamKey || '(no key)'}" as stream key. Edit the stream and enter your real stream key (from YouTube Studio → Go Live, or your provider).`,
        },
        400,
      );
    }
    stream.status = 'running';
    stream.started_at = new Date().toISOString();
    stream.error_message = null;
    writeDb(db);
    return jsonResponse({ success: true, connected: true, server, streamKey });
  }
  if (method === 'POST' && path === '/api/streams/stop') {
    const streamId = num(body, 'streamId', -1);
    const stream = db.streams.find((s) => s.id === streamId);
    if (stream) {
      stream.status = 'stopped';
      stream.started_at = null;
      writeDb(db);
    }
    return jsonResponse({ success: true });
  }
  if (method === 'POST' && path === '/api/streams/force-stop') {
    db.streams.forEach((s) => {
      s.status = 'stopped';
      s.started_at = null;
    });
    writeDb(db);
    return jsonResponse({ success: true });
  }
  if (method === 'POST' && path === '/api/streams/cleanup') {
    const before = db.streams.length;
    const seen = new Map<string, MockStream>();
    db.streams.forEach((s) => {
      const key = `${s.video_id}:${s.rtmp_url}`;
      if (!seen.has(key)) seen.set(key, s);
    });
    db.streams = Array.from(seen.values());
    writeDb(db);
    const removed = before - db.streams.length;
    return jsonResponse({ success: true, message: `Removed ${removed} duplicate stream(s)` });
  }
  if (method === 'POST' && path === '/api/streams/sync-status') {
    return jsonResponse({ success: true, message: 'Status synchronized' });
  }
  if (method === 'GET' && path === '/api/streams/stats') {
    const streamId = Number(params.get('streamId'));
    if (!Number.isNaN(streamId) && streamId > 0) {
      const stream = db.streams.find((s) => s.id === streamId);
      if (stream && stream.status === 'running') {
        return jsonResponse(simulatedStreamStats(stream));
      }
      return jsonResponse({
        bitrate: 0,
        fps: 0,
        speed: 1,
        quality: 'poor',
        errors: ['Stream is not running'],
      });
    }
    const running = db.streams.filter((s) => s.status === 'running');
    const stats = running.map((s) => simulatedStreamStats(s));
    const summary = {
      totalStreams: db.streams.length,
      excellentStreams: stats.filter((s) => s.quality === 'excellent').length,
      goodStreams: stats.filter((s) => s.quality === 'good').length,
      fairStreams: stats.filter((s) => s.quality === 'fair').length,
      poorStreams: stats.filter((s) => s.quality === 'poor').length,
      streamsWithErrors: 0,
    };
    const n = Math.max(stats.length, 1);
    const avgBitrate = stats.reduce((a, s) => a + s.bitrate, 0) / n;
    const avgFps = stats.reduce((a, s) => a + s.fps, 0) / n;
    const avgSpeed = stats.reduce((a, s) => a + s.speed, 0) / n;
    const overallQuality =
      stats.length === 0
        ? 'excellent'
        : avgSpeed >= 0.98 && avgSpeed <= 1.02
          ? 'excellent'
          : avgSpeed >= 0.95 && avgSpeed <= 1.05
            ? 'good'
            : avgSpeed >= 0.9 && avgSpeed <= 1.1
              ? 'fair'
              : 'poor';
    return jsonResponse({
      averages: {
        avgBitrate,
        avgFps,
        avgSpeed,
        totalDataTransferred: stats.length * 8_000_000,
        totalDroppedFrames: 0,
        overallQuality,
        problemStreams: [],
      },
      summary,
    });
  }
  if (method === 'GET' && path === '/api/streams/dashboard-status') {
    const activeCount = db.streams.filter((s) => s.status === 'running').length;
    return jsonResponse({ activeCount });
  }
  const streamUpdateMatch = path.match(/^\/api\/streams\/(\d+)\/update$/);
  if (method === 'PUT' && streamUpdateMatch) {
    const id = Number(streamUpdateMatch[1]);
    const stream = db.streams.find((s) => s.id === id);
    if (stream) {
      const videoId = num(body, 'videoId', stream.video_id);
      stream.name = str(body, 'name', stream.name);
      stream.video_id = videoId;
      stream.video_name = db.videos.find((v) => v.id === videoId)?.original_name || stream.video_name;
      stream.rtmp_url = str(body, 'rtmpUrl', stream.rtmp_url);
      stream.quality = str(body, 'quality', stream.quality);
      stream.loop_enabled = bool(body, 'loopEnabled', stream.loop_enabled);
      writeDb(db);
      return jsonResponse({ success: true, stream });
    }
    return jsonResponse({ success: false }, 404);
  }
  const streamDeleteMatch = path.match(/^\/api\/streams\/(\d+)\/delete$/);
  if (method === 'DELETE' && streamDeleteMatch) {
    const id = Number(streamDeleteMatch[1]);
    db.streams = db.streams.filter((s) => s.id !== id);
    writeDb(db);
    return jsonResponse({ success: true });
  }

  /* ------------------------------ system ----------------------------- */
  if (method === 'GET' && path === '/api/system/stats') {
    const activeStreams = db.streams.filter((s) => s.status === 'running').length;
    const tick = Math.floor(Date.now() / 5000);
    const systemCpu = 18 + ((tick * 7) % 14);
    return jsonResponse({
      systemCpu,
      amsCpu: systemCpu - 4,
      dbAvgQueryTime: 4 + ((tick * 3) % 6),
      activeStreams,
      idealStreams: 4,
      disk: { used: 86, total: 240, percent: 36, usedFormatted: '86 GB', totalFormatted: '240 GB' },
      memory: {
        used: 1.8,
        total: 4,
        percent: 45,
        usedFormatted: '1.8 GB',
        totalFormatted: '4 GB',
      },
      heap: { used: 220, total: 512, percent: 43, usedFormatted: '220 MB', totalFormatted: '512 MB' },
    });
  }

  /* ------------------------------ thumbs ----------------------------- */
  const thumbMatch = path.match(/^\/api\/thumbnails\/(.+)$/);
  if (method === 'GET' && thumbMatch) {
    return thumbRoute(decodeURIComponent(thumbMatch[1]));
  }

  if (path === '/api/health') {
    return jsonResponse({ status: 'ok' });
  }

  return jsonResponse({ error: `[demo mode] No mock handler for ${method} ${path}` }, 404);
}

/* ------------------------------ adapter ------------------------------ */

async function mockAdapter(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  const url = String(config.url || '');
  if (url.startsWith('/api/') || url.startsWith('api/')) {
    const response = await dispatch(config);
    response.config = config;
    const validateStatus = config.validateStatus || ((s: number) => s >= 200 && s < 300);
    if (!validateStatus(response.status)) {
      return Promise.reject(
        new axios.AxiosError(
          `Request failed with status code ${response.status}`,
          response.status >= 500 ? axios.AxiosError.ERR_BAD_RESPONSE : axios.AxiosError.ERR_BAD_REQUEST,
          config,
          response.request,
          response,
        ),
      );
    }
    return response;
  }
  throw new Error(`[demo mode] Unhandled request: ${config.method} ${url}`);
}

let initialized = false;

export function initMockApi(): void {
  if (initialized) return;
  initialized = true;
  axios.defaults.adapter = mockAdapter as never;
  try {
    if (!localStorage.getItem(DB_KEY)) {
      writeDb(seedDb());
    }
  } catch {
    /* ignore */
  }
}

export const mockKeys = { DB_KEY, SESSION_KEY } as const;