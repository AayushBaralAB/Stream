const express = require('express');
const router = express.Router();
const { getLogs, clearLogs } = require('../controllers/logController');
const auth = require('../middleware/auth');

router.get('/', auth, getLogs);
router.delete('/', auth, clearLogs);

module.exports = router;
