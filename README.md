# Aayush Live - Streaming Management Platform

A production-ready, full-stack live streaming management platform for [stream.aayushbaral.com](https://stream.aayushbaral.com). Authenticated administrators can upload videos, configure multiple streaming destinations (YouTube, Facebook, custom RTMP), start/stop live streams with FFmpeg, view live HLS previews, overlay a channel logo, and manage a breaking-news ticker — all from a modern dark broadcast-style dashboard.

## Features

- JWT-authenticated admin dashboard (login / register)
- Video upload with progress bar (persistent storage at `/data/videos`)
- Direct media URL or RTMP input as stream source
- Multi-destination streaming: one source to YouTube + Facebook + custom RTMP simultaneously
- HLS live preview player with LIVE badge, loading, offline, and auto-reconnect states
- Channel logo overlay (PNG, top-right, configurable width/opacity/margin)
- Breaking-news ticker management (add / edit / delete / activate)
- Nepal time display (Asia/Kathmandu, HH:mm:ss updating every second)
- Encrypted stream keys at rest (AES-256-GCM)
- Streaming logs and error tracking in MongoDB
- Responsive desktop / mobile UI

## Demo Account

Once you register the first (and only) admin account, registration closes. A demo admin is preconfigured:

- Email: `stream@aayushbaral.com`
- Password: `AayushLive@123`

It is also shown as a hint on the login page. Change it in the Profile page when you deploy for real.

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, Tailwind CSS, React Router, Axios, HLS.js, React Icons |
| Backend | Node.js, Express.js, MongoDB, Mongoose, JWT, bcryptjs, Multer, FFmpeg |
| Infrastructure | Azure Ubuntu VM, Docker / Docker Compose, Nginx, HTTPS (Let's Encrypt), MongoDB Atlas |

## Project Structure

```
/
├── frontend/             # React + Vite + Tailwind UI
├── backend/              # Express + MongoDB API + FFmpeg service
├── data/
│   ├── videos/           # Uploaded video files (Git-ignored)
│   ├── logos/            # Uploaded channel logos
│   └── hls/              # Generated HLS segments
├── deploy/
│   ├── nginx.conf        # Production Nginx configuration
│   └── deploy.sh         # One-shot Azure VM deployment script
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

## 1. Local Development

### Prerequisites

- Node.js 18+
- MongoDB Atlas account (or local MongoDB)
- FFmpeg installed and available in PATH

### Setup

```bash
# 1. Clone the repository
git clone <your-repo-url> stream.aayushbaral.com
cd stream.aayushbaral.com

# 2. Configure environment
cp .env.example .env
# Edit .env with your MONGODB_URI and a strong JWT_SECRET

# 3. Install backend dependencies
cd backend
npm install

# 4. Install frontend dependencies
cd ../frontend
npm install

# 5. Start the backend (in one terminal)
cd backend
npm run dev

# 6. Start the frontend (in another terminal)
cd frontend
npm run dev
```

Open http://localhost:5173 (Vite default), register the first admin, and you're in.

## 2. MongoDB Atlas Setup

1. Create a free cluster at https://www.mongodb.com/atlas
2. Create a database user with read/write access
3. Whitelist your VM/server IP (or `0.0.0.0/0` for development)
4. Get the connection string (e.g. `mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net`)

Put it in `.env`:

```
MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net
MONGODB_DB=aayush_live
```

The database `aayush_live` is created automatically with collections: `users`, `streams`, `videos`, `destinations`, `settings`, `news`, `logs`.

## 3. Environment Variables

Copy `.env.example` to `.env` and set:

| Variable | Description |
|---|---|
| `PORT` | Backend port (default 5000) |
| `MONGODB_URI` | Your MongoDB Atlas connection string (never commit) |
| `MONGODB_DB` | Database name (default `aayush_live`) |
| `JWT_SECRET` | Long random string used to sign tokens |
| `APP_URL` | Your public URL, e.g. `https://stream.aayushbaral.com` |
| `UPLOAD_DIR` | Where video files are stored (`/data/videos`) |
| `LOGO_DIR` | Where PNG logos are stored (`/data/logos`) |
| `HLS_DIR` | Where HLS output is written (`/data/hls`) |
| `ENCRYPTION_KEY` | 32+ char key for AES-256-GCM encryption of stream keys |
| `NODE_ENV` | `production` or `development` |

Generate a strong JWT secret and encryption key:

```bash
openssl rand -base64 32        # JWT_SECRET candidate
openssl rand -hex 32           # ENCRYPTION_KEY candidate
```

**Never commit `.env`.** It is in `.gitignore`.

## 4. FFmpeg Installation

The backend spawns FFmpeg as a child process. It must be available in `PATH`.

### Ubuntu / Debian

```bash
sudo apt update
sudo apt install -y ffmpeg
ffmpeg -version   # verify
```

### macOS

```bash
brew install ffmpeg
```

### Windows (development only)

Download from https://ffmpeg.org/download.html and add to `PATH`, or install via `choco install ffmpeg`.

The backend checks FFmpeg availability at stream start and returns a clear error if missing.

## 5. Docker Setup

### Local build

```bash
docker-compose up -d --build
```

This builds:
- **backend**: `node:20-alpine` + FFmpeg baked in, serves the API on port 5000
- **frontend**: multi-stage build (Vite build → Nginx), serves on port 3000

Persistent volumes:

| Volume | Mount |
|---|---|
| `videos_data` | `/data/videos` |
| `logos_data` | `/data/logos` |
| `hls_data` | `/data/hls` |

### Useful commands

```bash
docker-compose logs -f backend    # backend logs
docker-compose logs -f frontend   # frontend logs
docker-compose down               # stop everything
docker-compose down -v            # stop and remove volumes
```

## 6. Azure Deployment

Deploy to an Ubuntu VM on Azure (recommended size: 2 vCPU / 8 GB RAM — enough for FFmpeg encoding + HLS).

### 6a. Create the VM

1. Azure Portal → Create VM → Ubuntu 22.04 LTS
2. Size: Standard_B2s or larger
3. Open inbound ports: `80`, `443`
4. Enable SSH key auth

### 6b. Install Docker on the VM

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-v2 nginx certbot python3-certbot-nginx git
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

### 6c. Deploy

```bash
# From your local machine, push the repo to GitHub, then on the VM:
git clone <your-repo-url> /opt/stream
cd /opt/stream

cp .env.example .env
nano .env   # set MONGODB_URI, JWT_SECRET, ENCRYPTION_KEY etc.

sudo ./deploy/deploy.sh
```

`deploy.sh` will:
- Build the containers
- Install the Nginx config
- Request an HTTPS certificate via Certbot

### 6d. Manual management (alternative to containers)

```bash
# Backend
cd backend
npm ci --omit=dev
npm install -g pm2
pm2 start src/server.js --name aayush-live --env production
pm2 save && pm2 startup

# Restart after code pushes
cd backend && git pull && npm ci --omit=dev && pm2 restart aayush-live
```

## 7. Nginx Configuration

A ready-to-use config is at `deploy/nginx.conf`. It handles:

- HTTP → HTTPS redirect
- Frontend static assets (proxied to the frontend container on port 3000)
- `/api/*` → backend (port 5000)
- `/live/*` → HLS segments (with no-cache headers and CORS for players)
- Upload limit of 2 GB
- WebSocket/upgrade headers for future live features

Install it manually:

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/stream.aayushbaral.com
sudo ln -s /etc/nginx/sites-available/stream.aayushbaral.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## 8. Cloudflare DNS

If your domain is on Cloudflare:

1. Add an **A record**: `stream` → your VM public IP (Proxy status: **DNS only** during SSL setup, then enable proxy if desired)
2. (Recommended) Add analytics/tunnel services as needed

For Azure VM static IP, either reserve a Public IP (Azure Portal → VM → Networking → Public IP → Change to Static) or point Cloudflare at the current IP.

## 9. HTTPS Setup

Using Certbot + Nginx:

```bash
sudo certbot --nginx -d stream.aayushbaral.com -d www.stream.aayushbaral.com
```

For Cloudflare-proxied domains, you can also use Cloudflare's "Full (strict)" SSL mode and skip Certbot. Ensure the origin is set to HTTPS.

Verify certificates renew automatically:

```bash
sudo certbot renew --dry-run
```

## 10. GitHub Deployment

### First push

```bash
# Remove the remote if you're on a fresh repo
git remote add origin git@github.com:<you>/stream.aayushbaral.com.git
git add .
git commit -m "Initial commit: Aayush Live streaming platform"
git push -u origin main
```

### Continuous deploy (optional)

On the VM, create a hook or use GitHub Actions to SSH in and run:

```bash
cd /opt/stream && git pull && docker-compose up -d --build
```

A simple GitHub Actions workflow example:

```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to VM
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VM_HOST }}
          username: ${{ secrets.VM_USER }}
          key: ${{ secrets.VM_SSH_KEY }}
          script: |
            cd /opt/stream
            git pull
            docker-compose up -d --build
```

## 11. Troubleshooting

| Problem | Likely Fix |
|---|---|
| `MongoDB connection error` | Check `MONGODB_URI` / whitelist VM IP in Atlas |
| `FFmpeg not found` | `sudo apt install -y ffmpeg`, verify with `ffmpeg -version` |
| Stream starts then instantly errors | Check FFmpeg logs in the dashboard Logs page; verify destination keys |
| HLS preview stays black | Confirm `/live/stream.m3u8` is reachable; check stream status is LIVE |
| Upload fails | NVIDIA/Nginx `client_max_body_size` — set to `2G` (already in `deploy/nginx.conf`) |
| `Invalid RTMP URL` | Must start with `rtmp://` (or `rtmps://`) |
| `Destination not configured` | Create and enable a destination in Destinations page |
| `Stream already running` | Stop the current stream before starting again |
| Register says "closed" | Only the first admin can register — create your account on first setup |
| Upload too slow / timeout | Check `client_body_timeout` and VM bandwidth; ensure proxy buffering disabled for uploads |
| CORS errors on API | Set `APP_URL` correctly in `.env`; rebuild backend |

## 12. How to Add a YouTube Destination

1. Log in and open **Destinations**.
2. Platform: select **YouTube**.
3. Go to YouTube **Studio → Create → Go live** and copy the **stream key**.
4. Your RTMP URL is typically `rtmp://a.rtmp.youtube.com/live2`.
5. Enter a name (e.g. "YouTube Live"), paste the stream key, enable the destination, click **Create**.
6. In **Upload** (or Dashboard), select the destination and press **Start Stream**.

> The stream key is encrypted (AES-256-GCM) before being stored in MongoDB. Only the last 4 characters are ever shown in the UI.

## 13. How to Add a Facebook Destination

1. Log in and open **Destinations**.
2. Platform: select **Facebook**.
3. In Facebook, go to **Creator Studio → Live** and copy your stream key.
4. Your RTMP URL is typically `rtmps://live-api-s.facebook.com:443/rtmp/`.
5. Paste the key, enable, and create the destination.
6. Use it in Upload/Start Stream as above.

## 14. How to Add a Custom RTMP Destination

1. Log in and open **Destinations**.
2. Platform: select **Custom RTMP**.
3. Enter any service's RTMP ingest URL (e.g. `rtmp://ingest.some-platform.com/live`) and the key that platform gave you.
4. Enable and create.
5. This lets you push to Twitch (e.g. `rtmp://live.twitch.tv/app`), RESTREAM, Dacast, and any other RTMP ingest.

## Security Notes

- Passwords hashed with **bcrypt** (12 rounds)
- JWT tokens expire after **7 days**
- Stream keys encrypted with **AES-256-GCM** at rest
- Stream keys masked in the UI (`****abcd`)
- Rate limiting on auth and stream endpoints
- Helmet security headers, CORS restricted to `APP_URL`
- File type + size validation for uploads (video only, max 2 GB)
- No secrets in the frontend bundle or in Git
- FFmpeg never runs shell-constructed commands from user input — inputs are passed as argv to `spawn`

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register first admin |
| POST | `/api/auth/login` | Log in, get JWT |
| GET | `/api/auth/me` | Current user |
| PUT | `/api/auth/me` | Update profile |
| POST | `/api/streams/start` | Start stream (body: `sourceType`, `sourceUrl`/`videoId`, `destinationIds`) |
| POST | `/api/streams/stop` | Stop stream |
| GET | `/api/streams/status` | FFmpeg status + active stream |
| GET | `/api/streams/history` | Past stream records |
| POST | `/api/videos` | Upload video (multipart) |
| GET | `/api/videos` | List uploaded videos |
| DELETE | `/api/videos/:id` | Delete video |
| POST | `/api/destinations` | Create destination |
| GET | `/api/destinations` | List (masked keys) |
| PUT | `/api/destinations/:id` | Update |
| DELETE | `/api/destinations/:id` | Delete |
| PATCH | `/api/destinations/:id/toggle` | Enable/disable |
| GET/PUT | `/api/settings` | Get/update settings |
| POST | `/api/settings/logo` | Upload PNG logo |
| GET | `/api/news/active` | Active ticker items (public) |
| POST/GET/PUT/DELETE | `/api/news` | Manage news (auth required) |
| GET | `/api/logs` | Stream/system logs (auth required) |
| DELETE | `/api/logs` | Clear logs |
| GET | `/api/health` | Health check |

## License

Project for Aayush Baral. Built for production use on stream.aayushbaral.com.