const mongoose = require('mongoose');
const crypto = require('crypto');

const channelSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  type: { type: String, enum: ['public', 'private', 'direct'], default: 'private' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  inviteCode: { type: String, unique: true, sparse: true },
  isArchived: { type: Boolean, default: false },
  unreadCount: { type: Map, of: Number, default: {} },
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', default: null }
}, { timestamps: true });

// Generate a random invite code
channelSchema.methods.generateInviteCode = function() {
  this.inviteCode = crypto.randomBytes(16).toString('hex');
  return this.inviteCode;
};

channelSchema.index({ workspaceId: 1 });

module.exports = mongoose.model('Channel', channelSchema);
