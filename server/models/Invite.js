const mongoose = require('mongoose');

const inviteSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  expiresAt: { type: Date, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

module.exports = mongoose.model('Invite', inviteSchema);
