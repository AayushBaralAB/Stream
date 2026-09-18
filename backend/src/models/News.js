const mongoose = require('mongoose');

const newsSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500,
  },
  active: {
    type: Boolean,
    default: true,
  },
  priority: {
    type: Number,
    default: 0,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
}, { timestamps: true });

newsSchema.index({ active: 1, priority: -1 });

module.exports = mongoose.model('News', newsSchema);
