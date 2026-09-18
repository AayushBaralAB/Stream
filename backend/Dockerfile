FROM node:20-alpine

RUN apk add --no-cache ffmpeg fontconfig ttf-dejavu yt-dlp

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p /data/videos /data/logos /data/hls

EXPOSE 5000

CMD ["node", "src/server.js"]