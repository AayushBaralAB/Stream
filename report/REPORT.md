# Aayush Live Streaming Platform — Final Report

## 1. What was delivered

Working live-streaming platform (React + Node/Express + MongoDB + FFmpeg) verified end-to-end against the running stack:

| Feature | Status |
|---|---|
| Video upload / list / delete (with real duration) | Verified |
| AES-256-CBC encrypted video serving + decryption for transcode | Built & verified |
| HLS preview (`/live/stream.m3u8`) | Verified (HTTP 200, segments cycle) |
| Logo watermark overlay (any transparency level) | Verified (pixel-tested) |
| **On-video news scroller + live clock (bottom of frame)** | **New — verified (pixel-tested)** |
| RTMP relay to destinations | Built; failure path verified |
| Stream start / stop / status / history | Verified |
| Auth (login/register/me) | Verified |
| News CRUD + active feed | Verified |
| Destinations CRUD + toggle | Verified |
| Settings (incl. logo upload, ticker toggles) | Verified |
| Logs view / clear | Verified |
| Frontend build | Verified (`npm run build` OK) |
| Docker (compose config, Dockerfiles, nginx.conf) | Validated (daemon off — no live build) |

## 2. Root causes found & fixed

1. **Videos show `duration: 0`** — original upload flow never persisted file duration. Now ffprobe extracts real duration on upload and stores it.
2. **Encrypted videos played nothing** — HLS/stream flow read raw files while the controller served encrypted bytes. Decryption is now centralized and only applied when streaming; the stream input uses the real file so transcode works.
3. **Logo overlay broke the whole stream** — reversed filter inputs (`[logo][0:v]overlay`) made the logo the sized master input (200×80 yuv444p output). Fixed to `[0:v][logo]overlay=W-w-m:m:format=auto:alpha=a,format=yuv420p`.
4. **Logo + RTMP destination crashed ffmpeg** — one filter label (`[vout]`) was mapped to two outputs. Fixed with `split=N[vout0]…[voutN-1]`.
5. **Crash left stale UI state** — ffmpeg's `close` event now persists the run: stream → `idle`, destinations → `error`, last stderr lines stored as the error message, stale HLS cleaned. Manual stop keeps `disconnected` semantics.
6. **News field mismatch** — schema/API use `text` (not `title`); documented.
7. **Destinations** — update/delete work; toggle is `PATCH /api/destinations/:id/toggle`.

## 3. New feature: news scroller + live clock burned into the stream

Implemented in `backend/src/services/ffmpegService.js` + `streamManager.js`:

- When `tickerEnabled` and active news exist, the filter graph appends:
  - `drawbox` — 26px black @ 50% translucent bar across the bottom.
  - `drawtext` — live wall clock top-right of the bar (`%{localtime}`, white, black 1px border).
  - `drawtext` — scrolling news ticker via `textfile` reading a generated `ticker.txt` (news items joined with ` • ` separator, sorted by priority desc / creation asc), driven by `x='w-mod(t*speed,w+tw)'`.
- `tickerSpeed` (px/s, default 60) and `tickerEnabled` come from Settings (`Settings.jsx` UI already had the toggles).
- Font resolution: `TICKER_FONT` env override → auto-detect; on Windows prefers `mangal.ttf` when the ticker text contains Devanagari (else `arial.ttf`); on Linux tries DejaVu / Noto. Backend Dockerfile installs `fontconfig ttf-dejavu`.
- `.env.example` documents `TICKER_FONT`.

### Traps hit on this FFmpeg build (9.0.1 gyan, Windows) — resolved
- Windows font paths with a drive-letter colon inside a filter graph must be written as `fontfile='C\:/Windows/Fonts/mangal.ttf'` (quotes **and** `\:`). Single quotes or `\:` alone both fail (`No option name near ...`).
- `text='%{localtime\:%H\:%M\:%S}'` fails (`%{localtime} requires at most 1 arguments`) — the graph layer eats the escape so drawtext sees real colons. Bare `text='%{localtime}'` works and renders the full date/time.
- FFmpeg expressions have no `%` modulo — use `mod(a,b)`: `x='w-mod(t*60,w+tw)'`.

## 4. Verification evidence

- HLS: `GET http://localhost:5000/live/stream.m3u8` → 200; `.ts` segments generated and media sequence advances.
- Pixel analysis on a decoded output frame (576×1024, yuv420p):
  - Bottom bar avg luminance **64** vs mid-frame **188** → dark bar present.
  - **640 white text pixels** inside the bar → clock + scrolling news rendered.
  - Logo rect (x346-546, y30-110) → **636 red pixels** → watermark intact.
- Clean stop: `POST /api/streams/stop` → `code:"close"`, stream `status:"idle"`, `/status` → `running:false`.
- Dead RTMP destination (`rtmp://localhost/live/x`): persisted stream `idle` + dest `status:"error"` with real ffmpeg message; HLS cleaned.
- Upload→delete cycle: file removed from disk.
- `npm run build` (frontend) succeeds. `docker compose config` validates; `docker-compose.yml`, frontend `Dockerfile`+`nginx.conf`, backend `Dockerfile` confirmed correct (docker daemon not running locally, so build was not executed).

## 5. How to run

```
# backend
cd backend && npm install && npm start     # http://localhost:5000

# frontend
cd frontend && npm install && npm run dev  # http://localhost:5173 (proxies /api, /live)
```

`backend/src/config/env.js` wires config from `.env`; `frontend/nginx.conf` handles CORS + `/live` proxying for the Docker deployment.

## 6. Notes / follow-ups

- FFmpeg binary must be a build with `libfreetype` + `fontconfig` (gyan full build here). If `TICKER_FONT` is unset, fonts auto-detect for Devanagari (mangal) vs Latin (arial / DejaVu).
- Manual stream stop does not purge HLS segments (by design — live viewers can catch up); crashed streams do get cleaned.
- Radar of things verified earlier in the session is in `backend-err.log` / `backend.log` under the temp workspace, plus pixel-check scripts in `%TEMP%\opencode\`.