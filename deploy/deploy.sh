#!/bin/bash
set -e

echo "========================================"
echo "  Aayush Live - Azure VM Deployment"
echo "========================================"
echo

echo "1. Checking system packages..."
if ! command -v docker &> /dev/null; then
  echo "Docker not found. Install Docker first."
  exit 1
fi

if ! command -v docker-compose &> /dev/null; then
  echo "Docker Compose not found. Install docker-compose first."
  exit 1
fi

if ! command -v nginx &> /dev/null; then
  echo "Nginx not found. Install Nginx first."
  exit 1
fi

echo "  - Docker: OK"
echo "  - Docker Compose: OK"
echo "  - Nginx: OK"

echo
echo "2. Checking .env file..."
if [ ! -f .env ]; then
  echo "  ERROR: .env file not found."
  echo "  Copy .env.example to .env and fill in your values:"
  echo "    cp .env.example .env"
  echo "  Then edit .env with your MongoDB URI and JWT secret."
  exit 1
fi
echo "  - .env: OK"

echo
echo "3. Building and starting Docker containers..."
docker-compose up -d --build
echo "  - Containers started"

echo
echo "4. Applying Nginx configuration..."
if [ ! -f deploy/nginx.conf ]; then
  echo "  ERROR: deploy/nginx.conf not found."
  exit 1
fi
sudo cp deploy/nginx.conf /etc/nginx/sites-available/stream.aayushbaral.com
sudo ln -sf /etc/nginx/sites-available/stream.aayushbaral.com /etc/nginx/sites-enabled/ 2>/dev/null || true
sudo nginx -t
sudo systemctl reload nginx
echo "  - Nginx configured"

echo
echo "5. Setting up HTTPS with certbot..."
if command -v certbot &> /dev/null; then
  sudo certbot --nginx -d stream.aayushbaral.com -d www.stream.aayushbaral.com
else
  echo "  certbot not found. Run manually after domain points to this server:"
  echo "  sudo certbot --nginx -d stream.aayushbaral.com"
fi

echo
echo "========================================"
echo "  Deployment complete!"
echo "  Frontend:  https://stream.aayushbaral.com"
echo "  API:       https://stream.aayushbaral.com/api"
echo "  HLS:       https://stream.aayushbaral.com/live/stream.m3u8"
echo "========================================"