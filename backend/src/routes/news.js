const express = require('express');
const router = express.Router();
const { createNews, getNews, getActiveNews, updateNews, deleteNews, toggleNews } = require('../controllers/newsController');
const auth = require('../middleware/auth');

router.get('/active', getActiveNews);
router.post('/', auth, createNews);
router.get('/', auth, getNews);
router.put('/:id', auth, updateNews);
router.delete('/:id', auth, deleteNews);
router.patch('/:id/toggle', auth, toggleNews);

module.exports = router;
