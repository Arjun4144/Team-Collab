const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['task_assigned', 'mention', 'mention_aggregated'], required: true },
  title: { type: String, required: true },
  body: { type: String, default: '' },
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace' },
  channelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel' },
  referenceId: { type: mongoose.Schema.Types.ObjectId }, // taskId or messageId
  isRead: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);
