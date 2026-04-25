const mongoose = require('mongoose');
const crypto = require('crypto');

const workspaceSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  inviteCode: { type: String, unique: true, sparse: true }
}, { timestamps: true });

// Generate a random invite code
workspaceSchema.methods.generateInviteCode = function() {
  this.inviteCode = crypto.randomBytes(16).toString('hex');
  return this.inviteCode;
};

module.exports = mongoose.model('Workspace', workspaceSchema);
