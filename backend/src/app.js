const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const multer = require('multer');
const path = require('path');
const { apiLimiter } = require('./middleware/rateLimiter');

const authRoutes = require('./routes/auth');
const streamRoutes = require('./routes/streams');
const videoRoutes = require('./routes/videos');
const destinationRoutes = require('./routes/destinations');
const settingsRoutes = require('./routes/settings');
const newsRoutes = require('./routes/news');
const logRoutes = require('./routes/logs');

const app = express();

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

const allowedOrigins = [
  process.env.APP_URL,
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large. Limit is 10MB.' });
  }
  next(err);
});
app.use('/api', apiLimiter);

const hlsDir = process.env.HLS_DIR || path.join(__dirname, '../data/hls');
app.use('/live', express.static(hlsDir, {
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-cache');
    res.set('Access-Control-Allow-Origin', '*');
  },
}));

app.use('/api/auth', authRoutes);
app.use('/api/streams', streamRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/destinations', destinationRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/logs', logRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Maximum upload size is 2GB.' });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  if (err.message && (err.message.includes('Invalid file type') || err.message.includes('Only PNG'))) {
    return res.status(400).json({ error: err.message });
  }
  console.error('Unhandled error:', err);
  const expose = process.env.NODE_ENV !== 'production';
  res.status(500).json({ error: expose ? `Internal server error: ${err.message}` : 'Internal server error' });
});

module.exports = app;
