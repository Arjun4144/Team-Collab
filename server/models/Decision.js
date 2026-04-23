const mongoose = require('mongoose');

const decisionSchema = new mongoose.Schema({
  title: { type: String, required: true },
  body: { type: String, required: true },
  rationale: { type: String, default: '' },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  channel: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel' },
  sourceMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  status: { type: String, enum: ['active', 'superseded', 'revoked'], default: 'active' },
  tags: [String],
  acknowledgedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

decisionSchema.index({ channel: 1, createdAt: -1 });

module.exports = mongoose.model('Decision', decisionSchema);
