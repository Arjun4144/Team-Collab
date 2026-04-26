const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  channel: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, default: '' },
  messageType: { type: String, enum: ['text', 'audio'], default: 'text' },
  audioDuration: { type: Number, default: 0 },
  intentType: {
    type: String,
    enum: ['discussion', 'announcement', 'decision', 'action', 'fyi'],
    default: 'discussion'
  },
  priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
  threadParent: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
  replyCount: { type: Number, default: 0 },
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isEdited: { type: Boolean, default: false },
  isResolved: { type: Boolean, default: false },
  verdict: { type: String, default: '' },
  attachments: {
    type: [{
      name: String,
      url: String,
      type: { type: String },
      size: Number
    }],
    default: []
  },
  reactions: [{ emoji: String, users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }] }],
  isDeleted: { type: Boolean, default: false },
  hiddenBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

messageSchema.index({ channel: 1, createdAt: -1 });
messageSchema.index({ intentType: 1 });

module.exports = mongoose.model('Message', messageSchema);
