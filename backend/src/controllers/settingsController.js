const Settings = require('../models/Settings');
const streamManager = require('../services/streamManager');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const logoDir = process.env.LOGO_DIR || '/data/logos';
fs.mkdirSync(logoDir, { recursive: true });

const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, logoDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `logo-${uuidv4()}${ext}`);
  },
});

const logoUpload = multer({
  storage: logoStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'image/png') {
      cb(null, true);
    } else {
      cb(new Error('Only PNG logos are allowed'), false);
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

exports.uploadLogo = [
  logoUpload.single('logo'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No logo file provided' });
      }

      const oldLogo = await Settings.get('logoPath', '');
      if (oldLogo && fs.existsSync(oldLogo)) {
        try { fs.unlinkSync(oldLogo); } catch {}
      }

      await Settings.set('logoPath', req.file.path, req.user._id);

      res.json({ message: 'Logo uploaded', logoPath: `/api/settings/logo-file` });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
];

exports.getLogoFile = async (req, res) => {
  try {
    const logoPath = await Settings.get('logoPath', '');
    if (!logoPath || !fs.existsSync(logoPath)) {
      return res.status(404).json({ error: 'No logo found' });
    }
    res.sendFile(logoPath);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getSettings = async (req, res) => {
  try {
    const keys = [
      'logoEnabled', 'logoWidth', 'logoMargin', 'logoOpacity',
      'tickerEnabled', 'tickerSpeed',
      'defaultVideoIds', 'loopEnabled',
    ];
    const settings = {};
    for (const key of keys) {
      settings[key] = await Settings.get(key);
    }
    const hasLogo = await Settings.get('logoPath', '');
    settings.hasLogo = !!hasLogo;
    res.json({ settings });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const updates = req.body;
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'logoPath') continue;
      await Settings.set(key, value, req.user._id);
    }

    // Ticker/logo changes affect the burned-in ffmpeg overlay, which is built at
    // stream start. Apply them to the running broadcast right away so the user
    // can switch the ticker on/off without manually restarting.
    const overlayKeys = ['tickerEnabled', 'tickerSpeed', 'logoEnabled', 'logoWidth', 'logoMargin', 'logoOpacity'];
    let live = null;
    if (Object.keys(updates).some((k) => overlayKeys.includes(k))) {
      try {
        live = await streamManager.restartActive();
      } catch (err) {
        live = { restarted: false, error: err.message };
      }
    }

    res.json({ message: 'Settings updated', live });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
