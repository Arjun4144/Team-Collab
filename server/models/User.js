const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Avatar sub-schema — always { url, public_id }, never a string or null
const avatarSchema = new mongoose.Schema({
  url: { type: String, default: '' },
  public_id: { type: String, default: '' }
}, { _id: false });

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  avatar: {
    type: avatarSchema,
    default: () => ({ url: '', public_id: '' }),
    set: function(val) {
      // Safety guard: normalize any non-object value to the correct shape
      if (val === null || val === undefined) {
        return { url: '', public_id: '' };
      }
      if (typeof val === 'string') {
        return {
          url: val.startsWith('http') ? val : '',
          public_id: ''
        };
      }
      return val;
    }
  },
  bio: { type: String, default: '', trim: true },
  status: { type: String, enum: ['online', 'away', 'busy', 'offline'], default: 'offline' },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toPublic = function() {
  const obj = this.toObject();
  delete obj.password;
  // Final safety: ensure avatar is always an object in API responses
  if (!obj.avatar || typeof obj.avatar === 'string') {
    obj.avatar = { url: '', public_id: '' };
  }
  return obj;
};

module.exports = mongoose.model('User', userSchema);
