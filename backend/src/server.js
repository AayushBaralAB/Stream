const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const repoEnv = path.resolve(__dirname, '../../.env');
const localEnv = path.resolve(__dirname, '../.env');
dotenv.config({ path: fs.existsSync(repoEnv) ? repoEnv : localEnv });

// On Windows, the Linux-style /data/* defaults point at the drive root (e.g. D:\data).
// Resolve upload/logo/HLS dirs into the project so development storage stays in-repo.
if (process.platform === 'win32') {
  const fallbacks = {
    UPLOAD_DIR: ['/data/videos', '../../data/videos'],
    LOGO_DIR: ['/data/logos', '../../data/logos'],
    HLS_DIR: ['/data/hls', '../../data/hls'],
  };
  for (const [key, [linuxDefault, relative]] of Object.entries(fallbacks)) {
    if (!process.env[key] || process.env[key] === linuxDefault) {
      process.env[key] = path.resolve(__dirname, relative);
    }
  }
}

const { validateEnv } = require('./config/env');
validateEnv();

const app = require('./app');
const connectDB = require('./config/db');

const PORT = process.env.PORT || 5000;

async function start() {
  const dirs = [
    process.env.UPLOAD_DIR,
    process.env.LOGO_DIR,
    process.env.HLS_DIR,
  ];
  dirs.forEach(dir => fs.mkdirSync(dir, { recursive: true }));

  await connectDB();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Upload dir: ${process.env.UPLOAD_DIR}`);
    console.log(`Logo dir: ${process.env.LOGO_DIR}`);
    console.log(`HLS dir: ${process.env.HLS_DIR}`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});