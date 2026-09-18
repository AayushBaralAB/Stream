const mongoose = require('mongoose');

const destinationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  platform: {
    type: String,
    enum: ['youtube', 'facebook', 'custom'],
    required: true,
  },
  rtmpUrl: {
    type: String,
    required: true,
  },
  streamKey: {
    type: String,
    required: true,
  },
  streamKeyEncrypted: {
    type: Boolean,
    default: false,
  },
  enabled: {
    type: Boolean,
    default: true,
  },
  lastUsed: {
    type: Date,
    default: null,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
}, { timestamps: true });

destinationSchema.methods.getMaskedKey = function() {
  if (!this.streamKey) return '************';
  const key = this.streamKey;
  if (key.length <= 8) return '********';
  return '*'.repeat(key.length - 4) + key.slice(-4);
};

module.exports = mongoose.model('Destination', destinationSchema);
