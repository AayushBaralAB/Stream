const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const repoEnv = path.resolve(__dirname, '../../.env');
const localEnv = path.resolve(__dirname, '../.env');
dotenv.config({ path: fs.existsSync(repoEnv) ? repoEnv : localEnv });

const express = require('express');
const connectDB = require('./config/db');
const app = require('./app');

const PORT = process.env.PORT || 5000;

async function start() {
  const dirs = [
    process.env.UPLOAD_DIR || '/data/videos',
    process.env.LOGO_DIR || '/data/logos',
    process.env.HLS_DIR || '/data/hls',
  ];
  dirs.forEach(dir => fs.mkdirSync(dir, { recursive: true }));

  await connectDB();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
