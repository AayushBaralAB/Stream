FROM node:20-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p /data/videos /data/logos /data/hls

EXPOSE 5000

CMD ["node", "src/server.js"]