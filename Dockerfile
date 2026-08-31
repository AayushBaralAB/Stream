# ---------- build stage ----------
FROM node:20-alpine AS build
WORKDIR /app

# Build-time static configuration (empty base path for the server mode).
ARG NEXT_PUBLIC_BASE_PATH=
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

# ---------- production image ----------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# FFmpeg (used to push streams to YouTube etc.) and timezone data.
RUN apk add --no-cache ffmpeg tzdata dumb-init

RUN addgroup -S nodejs && adduser -S app -G nodejs

# Runtime dirs: static export, server code, and persistent data/upload volume.
COPY --from=build /app/out ./out
COPY --from=build /app/server ./server
COPY --from=build /app/public ./public
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/package.json /app/package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# Pre-create the persistent data volume mount point (owned by `app`) so
# Docker seeds a first-use named volume with non-root ownership.
RUN mkdir -p /data/uploads && chown -R app:nodejs /data

USER app
EXPOSE 3000

VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1

# dense logging for docker logs; ffmpeg resumes its own streams on restart.
CMD ["dumb-init", "node", "server/index.js"]