const express = require('express');
const router = express.Router();
const { getSettings, updateSettings, uploadLogo, getLogoFile } = require('../controllers/settingsController');
const auth = require('../middleware/auth');

router.get('/', auth, getSettings);
router.put('/', auth, updateSettings);
router.post('/logo', auth, uploadLogo);
router.get('/logo-file', getLogoFile);

module.exports = router;
