const express = require('express');
const router = express.Router();
const {
  createDestination, getDestinations,
  updateDestination, deleteDestination, toggleDestination,
} = require('../controllers/destinationController');
const auth = require('../middleware/auth');

router.post('/', auth, createDestination);
router.get('/', auth, getDestinations);
router.put('/:id', auth, updateDestination);
router.delete('/:id', auth, deleteDestination);
router.patch('/:id/toggle', auth, toggleDestination);

module.exports = router;
