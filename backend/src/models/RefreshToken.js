const mongoose = require('mongoose');
const crypto = require('crypto');

const refreshTokenSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true,
  },
  revoked: {
    type: Boolean,
    default: false,
  },
  replacedByToken: {
    type: String,
    default: null,
  },
  deviceInfo: {
    type: String,
    default: '',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Hash token trước khi lưu
refreshTokenSchema.statics.hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// Tìm token hợp lệ (chưa revoked, chưa hết hạn)
refreshTokenSchema.statics.findValid = function (tokenHash, userId) {
  return this.findOne({
    token: tokenHash,
    userId,
    revoked: false,
    expiresAt: { $gt: new Date() },
  });
};

// Tự động xoá token hết hạn sau 30 ngày
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);