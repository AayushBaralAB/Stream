const express = require('express');
const router = express.Router();
const { startStream, stopStream, getStatus, getHistory } = require('../controllers/streamController');
const auth = require('../middleware/auth');
const { streamLimiter } = require('../middleware/rateLimiter');

router.post('/start', auth, streamLimiter, startStream);
router.post('/stop', auth, streamLimiter, stopStream);
router.get('/status', auth, getStatus);
router.get('/history', auth, getHistory);

module.exports = router;
