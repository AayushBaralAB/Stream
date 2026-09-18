const express = require('express');
const router = express.Router();
const { uploadVideo, getVideos, deleteVideo } = require('../controllers/videoController');
const auth = require('../middleware/auth');

router.post('/', auth, uploadVideo);
router.get('/', auth, getVideos);
router.delete('/:id', auth, deleteVideo);

module.exports = router;
