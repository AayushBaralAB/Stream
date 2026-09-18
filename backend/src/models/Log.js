const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
  level: {
    type: String,
    enum: ['info', 'warn', 'error', 'debug'],
    default: 'info',
  },
  message: {
    type: String,
    required: true,
  },
  source: {
    type: String,
    default: 'system',
  },
  streamId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Stream',
    default: null,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
}, { timestamps: true });

logSchema.index({ createdAt: -1 });
logSchema.index({ level: 1 });

module.exports = mongoose.model('Log', logSchema);
