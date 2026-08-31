# AB Streaming Software - Deployment Guide

## GitHub Pages (Static Demo Build)

This build runs entirely in the browser — no server needed. The backend
(SQLite / FFmpeg / login) is replaced by a browser demo layer backed by
`localStorage` + IndexedDB, so every screen works on a static host.

```bash
# 1. Build the static site (outputs to ./out)
npm run build

# 2. Preview locally
npm run preview      # http://localhost:3000
```

Deploying:

- **User site** (`https://aayushbaralab.github.io/`): push the contents of
  `./out` to the root of a repo named `aayushbaralab.github.io` (GitHub Pages
  → Source: your branch).
- **Project site / sub-path** (`https://user.github.io/repo/`): build with
  `set NEXT_PUBLIC_BASE_PATH=/repo` (then `npm run build`) so asset links are
  prefixed, and set Pages source to `./out`.

Demo mode login: **admin / admin**.

> Note: uploading a video in the demo keeps the file only in that browser
> (IndexedDB), and playback is local to the device.

## Pre-Deployment Checklist

- [ ] FFmpeg installed on server
- [ ] Node.js 18+ installed
- [ ] Sufficient disk space for videos
- [ ] Adequate upload bandwidth (3-5 Mbps per stream)
- [ ] SSL certificate configured (for HTTPS)

## Quick Deployment

### 1. Clone and Setup

```bash
git clone https://github.com/your-repo/ab-streaming-software.git
cd ab-streaming-software
npm run setup
```

### 2. Configure Environment

```bash
cp .env.example .env.local
```

Generate a secure password hash:
```bash
npm run generate-password
```

Edit `.env.local`:
```env
SESSION_SECRET=<generate-with-openssl-rand-base64-32>
ADMIN_USERNAME=your-username
ADMIN_PASSWORD_HASH=<hash-from-generate-password>
```

### 3. Build and Start

```bash
npm run build
npm start
```

## Docker Deployment

### Quick Start
```bash
docker-compose -f docker-compose.production.yml up -d
```

### With Custom Environment
```bash
# Create .env file with your settings
docker-compose -f docker-compose.production.yml --env-file .env up -d
```

## Production with PM2

### Install PM2
```bash
npm install -g pm2
```

### Create ecosystem file
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'ab-streaming-software',
    script: 'npm',
    args: 'start',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    max_memory_restart: '1G',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
}
```

### Start with PM2
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## Nginx Configuration

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    client_max_body_size 5G;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
```

## Post-Deployment

### 1. Test Health Endpoint
```bash
curl http://localhost:3000/api/health
```

### 2. Create First Stream
1. Login at https://yourdomain.com/auth/login
2. Upload a video
3. Create a stream
4. Start streaming!

### 3. Monitor Logs
```bash
# PM2
pm2 logs ab-streaming-software

# Docker
docker-compose -f docker-compose.production.yml logs -f

# System logs
tail -f logs/combined.log
```

## Backup Strategy

### Database Backup
```bash
# Backup
cp data/streams.db data/streams.db.backup

# Restore
cp data/streams.db.backup data/streams.db
```

### Video Backup
```bash
# Backup uploads
tar -czf uploads-backup.tar.gz uploads/

# Restore
tar -xzf uploads-backup.tar.gz
```

## Troubleshooting

### Stream Won't Start
- Check FFmpeg is installed: `ffmpeg -version`
- Verify RTMP URL is correct
- Check system resources: `top` or `htop`
- Review logs for errors

### Upload Fails
- Check disk space: `df -h`
- Verify upload directory permissions: `ls -la uploads/`
- Check Nginx client_max_body_size

### High CPU Usage
- Limit concurrent streams
- Use lower quality settings
- Check for runaway FFmpeg processes: `ps aux | grep ffmpeg`

## Security Hardening

1. **Change default credentials immediately**
2. **Use strong SESSION_SECRET** (32+ characters)
3. **Enable firewall** (allow only 80, 443, SSH)
4. **Regular updates**: `npm audit fix`
5. **Monitor access logs**
6. **Set up fail2ban for brute force protection**

## Performance Tuning

### System Limits
```bash
# /etc/security/limits.conf
* soft nofile 65535
* hard nofile 65535
```

### Sysctl Optimizations
```bash
# /etc/sysctl.conf
net.core.rmem_max = 134217728
net.core.wmem_max = 134217728
net.ipv4.tcp_rmem = 4096 87380 134217728
net.ipv4.tcp_wmem = 4096 65536 134217728
```

### Node.js Optimizations
```bash
# Increase memory limit
NODE_OPTIONS="--max-old-space-size=4096" npm start
```

## Monitoring

### Set up monitoring with:
- **Uptime monitoring**: UptimeRobot, Pingdom
- **Resource monitoring**: Netdata, Grafana
- **Log aggregation**: ELK Stack, Papertrail
- **Error tracking**: Sentry

## Support

For issues or questions:
- Check logs first
- Review troubleshooting section
- Create GitHub issue with details

---

© 2026 AB Streaming Software by Aayush Baral