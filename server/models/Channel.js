const mongoose = require('mongoose');

const channelSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  type: { type: String, enum: ['public', 'private', 'direct'], default: 'private' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isArchived: { type: Boolean, default: false },
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', default: null }
}, { timestamps: true });

channelSchema.index({ workspaceId: 1 });

module.exports = mongoose.model('Channel', channelSchema);
