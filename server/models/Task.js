const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  channel: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel' },
  sourceMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  status: { type: String, enum: ['todo', 'in_progress', 'done', 'cancelled'], default: 'todo' },
  priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
  dueDate: { type: Date },
  completedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Task', taskSchema);
