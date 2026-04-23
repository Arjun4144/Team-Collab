const mongoose = require('mongoose');

const channelSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  type: { type: String, enum: ['public', 'private', 'direct'], default: 'public' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isArchived: { type: Boolean, default: false },
  unreadCount: { type: Map, of: Number, default: {} }
}, { timestamps: true });

module.exports = mongoose.model('Channel', channelSchema);
