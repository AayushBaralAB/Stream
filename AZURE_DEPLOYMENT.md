# Azure Deployment — AB Streaming Software

Phase 1 production deployment: a 24/7 all-in-one streaming server that runs on one
small Azure Ubuntu VM, stores metadata in MongoDB Atlas, keeps video files on the
VM disk, and uses FFmpeg (inside the container) to re-stream your video library to a
self-hosted/YouTube RTMP endpoint around the clock. The admin UI (the same Next.js
dashboard) is served by the Express server in *live mode* (no browser mock).

---

## Architecture

```
browser ── https://stream.aayushbaral.com ──► reverse proxy (Caddy/Traefik) ──► 127.0.0.1:3000
                                                                                      │
                                                                                 Express (Docker)
                                                                        ┌────────────┼────────────┐
                                                                        ▼            ▼            ▼
                                                          Mongo Atlas (metadata)   local disk      FFmpeg
                                                                             (videos, /data)  ──► rtmp://…/live/<key>
```

* **Metadata** (videos, streams, settings) → MongoDB Atlas.
  * If `MONGODB_URI` is empty, the server transparently falls back to a JSON file
    store under `/data` (fine for a single-VM deployment with no Atlas account).
* **Video files** → persistent volume on the VM (`/data/uploads`). Uploaded via the UI.
* **Streaming** → FFmpeg in the container pushes to the RTMP URL you configure per
  stream (e.g. YouTube `rtmp://a.rtmp.youtube.com/live2/<key>`). A watchdog restarts
  crashed/terminated encodes automatically (bounded retry, then marks the stream `error`).
* **UI** → the Next.js static export is served by Express with `window.__AB_LIVE__`
  injected, so the browser talks to the real API (no mock). Login uses an HttpOnly
  cookie (`ab_session`).

---

## 1. Prerequisites

* An **Azure Ubuntu VM** (Standard_B1s / B2s is plenty; 1–2 GB RAM).
  * Inbound rules: `80`, `443`. **Port `1935` is NOT needed** — this server only *pushes*
    RTMP; it never accepts inbound streams.
* A **domain** (e.g. `stream.aayushbaral.com`) with an `A`/`AAAA` record pointing at the VM.
* SSH access to the VM.
* Docker + Compose plugin on the VM.
* (Optional) A **MongoDB Atlas** free M0 cluster + database user with read/write on a
  `ab_streaming` database. Note the connection string.

### 1.1 On the VM

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# log out / in again, then:
docker compose version
```

---

## 2. Clone and configure

```bash
sudo mkdir -p /opt/streaming && sudo chown $USER /opt/streaming
cd /opt/streaming
git clone https://github.com/AayushBaralAB/Stream.git .
cp .env.example .env
```

Fill in `.env`:

```ini
# REQUIRED
SESSION_SECRET=<run: openssl rand -hex 32>
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=<run: npm run generate-password, pick the hash>

# OPTIONAL — recommended
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
BASE_PATH=
TZ=Asia/Kathmandu
COOKIE_SECURE=true          # because the site is served over HTTPS
SESSION_TTL_SECONDS=604800  # 7 days

# MongoDB Atlas (leave MONGODB_URI empty to use the JSON-file fallback)
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net
MONGODB_DB=ab_streaming

# Videos / data volumes (keep these — docker-compose maps them)
UPLOAD_DIR=/data/uploads
DATA_DIR=/data
```

> **Secrets:** `.env` is git-ignored and never committed. If you ever change
> `SESSION_SECRET`, existing login cookies are invalidated.

## 3. Build and start

```bash
docker compose up -d --build
docker compose ps          # wait for the container to be healthy
docker compose logs -f --tail=100
```

On first boot the server:
1. Creates the admin login / session secret (from `.env`).
2. Seeds a demo video + "Demo YouTube Stream" if the database is empty.
3. Serves the UI on `http://localhost:3000` and answers `GET /api/health` (used by
   the container healthcheck — `docker compose ps` shows `(healthy)`).

Verify locally from the VM:

```bash
curl -s http://127.0.0.1:3000/api/health   # {"ok":true,"ffmpeg":true,...}
curl -s -i -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/auth/login  # 200
```

## 4. HTTPS reverse proxy

Recommended: **Caddy** (auto HTTPS via ACME, needs ports 80/443).

`Caddyfile`:

```
stream.aayushbaral.com {
    reverse_proxy 127.0.0.1:3000
    encode zstd gzip
}
```

```bash
sudo apt install -y caddy
sudo mkdir -p /etc/caddy && sudo cp Caddyfile /etc/caddy/Caddyfile
sudo systemctl enable --now caddy
```

(Or any proxy: Traefik with the `stream` label on the streaming service, Nginx 401-style,
or Azure Front Door/CNAME.) After DNS propagates you should get a valid cert and a working UI.

## 5. Using it

1. Open `https://stream.aayushbaral.com` → log in with `ADMIN_USERNAME` +
   your password.
2. **Videos** → upload the clip(s) you want to stream 24/7.
3. **Streams** → create a stream: pick a video, choose quality (720p/1080p default),
   enable **Loop video**, and enter your real RTMP endpoint + key
   (e.g. YouTube: `rtmp://a.rtmp.youtube.com/live2/<stream-key>`).
4. Click **Start**. FFmpeg encodes and pushes. Check **Dashboard** for live stats
   (bitrate/FPS/health). If the process dies the watchdog restarts it automatically;
   after `FFMPEG_MAX_RESTARTS` failures the stream is marked `error` with the reason.

## 6. Updates & maintenance

```bash
cd /opt/streaming
git pull
docker compose up -d --build
```

* Backups: `/data` (uploads + JSON store) and the Atlas database. A simple cron dump:
  `tar czf /data/backups/stream-$(date +%F).tar.gz /data/uploads`.

### Behavior notes

* **Watchdog**: default `WATCHDOG_INTERVAL_MS=3000`, `FFMPEG_MAX_RESTARTS=6`,
  `FFMPEG_RESTART_DELAY_MS=30000` (set in `.env`/Dockerfile defaults). A `loopEnabled`
  stream that hits sustainable 60s of encode failures (e.g. bad key) settles to `error`.
* **Restart policy**: `docker-compose.yml` sets `restart: unless-stopped`, so the VM
  rebooting brings everything back automatically.
* **Memory**: the compose file caps the container (default 1 GB); one 720p `libx264
  veryfast` re-encode uses roughly 100–200 MB.

## 7. Troubleshooting

| Symptom | Check |
|---|---|
| Container not `healthy` | `docker compose logs`; is `.env` filled in? is `ADMIN_PASSWORD_HASH`/`ADMIN_PASSWORD` set? |
| UI loads but API calls 401 | Set `COOKIE_SECURE=true` (cookie is Secret-only over HTTP); clear cookies after changing `SESSION_SECRET`. |
| Stream goes `error` immediately | RTMP key invalid/placeholder (`a-b-c-d` rejects with 400); `rtmp://…/live2/<key>` host unreachable (TCP preflight at start); paste the real key. |
| Watchdog restarts every N seconds | Check `docker compose logs` ffmpeg logs: bad key, network, or `-stream_loop` re-encode issue; stop the stream, fix, restart. |
| Mongo won't connect | Confirm Atlas network access allows the VM's egress IP (`0.0.0.0/0` for a free cluster), DB user password has no shell-special chars, URI quoted in `.env`. Try with `MONGODB_URI=` empty to validate the JSON fallback path first. |
| Everything works locally but not on the VM | Ports 80/443 inbound; DNS A record; Caddy cert issuance. |

## 8. Local dev / verification cheatsheet

```bash
npm install
npm run build      # compiles the Next.js static export (basePath '')
npm run typecheck  # tsc --noEmit
npm run lint
npm run smoke      # boots a real server: health/auth/media-range/upload/stream start-stop/watchdog/settings/logout (38 checks)
npm run server     # node server/index.js  (needs .env or env vars)
```