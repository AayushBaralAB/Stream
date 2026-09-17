const mongoose = require('mongoose');

const streamSchema = new mongoose.Schema({
  sourceType: {
    type: String,
    enum: ['upload', 'url', 'rtmp_input'],
    default: 'upload',
  },
  sourceUrl: {
    type: String,
    default: '',
  },
  videoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Video',
    default: null,
  },
  destinationIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Destination',
  }],
  status: {
    type: String,
    enum: ['idle', 'starting', 'running', 'stopping', 'error'],
    default: 'idle',
  },
  pid: {
    type: Number,
    default: null,
  },
  startedAt: {
    type: Date,
    default: null,
  },
  stoppedAt: {
    type: Date,
    default: null,
  },
  destinationStatuses: [{
    destination: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Destination',
    },
    status: {
      type: String,
      enum: ['connecting', 'streaming', 'error', 'disconnected'],
      default: 'connecting',
    },
    error: {
      type: String,
      default: '',
    },
  }],
  error: {
    type: String,
    default: '',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
}, { timestamps: true });

module.exports = mongoose.model('Stream', streamSchema);
