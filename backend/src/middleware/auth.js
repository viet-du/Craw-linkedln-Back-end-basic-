const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { logger } = require('../utils/logger');
const { client: redisClient } = require('../utils/redisClient');
const RefreshToken = require('../models/RefreshToken');

// -------------------- Xác thực JWT / API Key --------------------
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  const apiKey = req.headers['x-api-key'];

  if (!token && !apiKey) {
    return res.status(401).json({ error: 'Access denied', code: 'NO_AUTH_TOKEN' });
  }

  if (apiKey) {
    return authenticateApiKey(req, res, next, apiKey);
  }

  // Kiểm tra blacklist access token (Redis)
  if (redisClient && redisClient.isOpen) {
    const blacklisted = await redisClient.get(`blacklist:${token}`);
    if (blacklisted) {
      return res.status(401).json({ error: 'Token revoked', code: 'TOKEN_REVOKED' });
    }
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
      }
      return res.status(403).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
    }
    if (user.isActive === false) {
      return res.status(403).json({ error: 'Account inactive', code: 'ACCOUNT_INACTIVE' });
    }
    req.user = user;
    next();
  });
}

async function authenticateApiKey(req, res, next, apiKey) {
  try {
    const User = require('../models/User');
    const user = await User.findOne({ apiKey });
    if (!user || !user.isActive) {
      return res.status(403).json({ error: 'Invalid API key', code: 'INVALID_API_KEY' });
    }
    req.user = { id: user._id, username: user.username, role: user.role, authMethod: 'api_key' };
    next();
  } catch (error) {
    res.status(500).json({ error: 'Auth error', code: 'AUTH_ERROR' });
  }
}

// -------------------- Phân quyền --------------------
function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Auth required', code: 'AUTH_REQUIRED' });
    if (req.user.role === 'admin') return next();
    if (roles.includes(req.user.role)) return next();
    return res.status(403).json({ error: 'Insufficient permissions', code: 'INSUFFICIENT_PERMISSIONS' });
  };
}

// -------------------- Tạo Access Token --------------------
function generateToken(user) {
  return jwt.sign(
    {
      id: user._id,
      username: user.username,
      role: user.role,
      isActive: user.isActive,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
      issuer: 'linkedin-backend-api',
      audience: 'web-client',
    }
  );
}

// -------------------- Tạo Refresh Token (lưu vào DB) --------------------
async function generateRefreshToken(user, deviceInfo = '') {
  const refreshToken = jwt.sign(
    { id: user._id, type: 'refresh' },
    process.env.JWT_SECRET,
    { expiresIn: '7d', issuer: 'linkedin-backend-api', audience: 'web-client' }
  );

  const tokenHash = RefreshToken.hashToken(refreshToken);
  
  // Thu hồi tất cả token cũ nếu vượt quá số lượng cho phép (tùy chọn)
  // Giới hạn số lượng refresh token đồng thời cho mỗi user (ví dụ 5)
  const MAX_CONCURRENT_TOKENS = 5;
  const validTokens = await RefreshToken.findAllValidByUser(user._id);
  if (validTokens.length >= MAX_CONCURRENT_TOKENS) {
    // Sắp xếp theo createdAt và xóa token cũ nhất
    validTokens.sort((a, b) => a.createdAt - b.createdAt);
    await RefreshToken.findByIdAndUpdate(validTokens[0]._id, { revoked: true, revokedAt: new Date() });
  }

  await RefreshToken.create({
    token: tokenHash,
    userId: user._id,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    deviceInfo,
  });

  return refreshToken;
}

// -------------------- Xác thực Refresh Token --------------------
async function verifyRefreshToken(token) {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'refresh') throw new Error('Invalid token type');

    const tokenHash = RefreshToken.hashToken(token);
    const refreshRecord = await RefreshToken.findValid(tokenHash, decoded.id);

    if (!refreshRecord) {
      throw new Error('Refresh token not found or revoked');
    }

    return { decoded, recordId: refreshRecord._id };
  } catch (err) {
    throw new Error('Invalid refresh token');
  }
}

// -------------------- Thu hồi Refresh Token --------------------
async function revokeRefreshToken(token, replacedByToken = null) {
  const tokenHash = RefreshToken.hashToken(token);
  const record = await RefreshToken.findOne({ token: tokenHash });
  if (record) {
    record.revoked = true;
    record.revokedAt = new Date();
    record.replacedByToken = replacedByToken ? RefreshToken.hashToken(replacedByToken) : null;
    await record.save();
  }
}

// -------------------- Thu hồi tất cả Refresh Token của một user --------------------
async function revokeAllUserRefreshTokens(userId, exceptTokenHash = null) {
  const query = { userId, revoked: false };
  const tokens = await RefreshToken.find(query);
  
  for (const token of tokens) {
    if (exceptTokenHash && token.token === exceptTokenHash) continue;
    token.revoked = true;
    token.revokedAt = new Date();
    await token.save();
  }
}

// -------------------- Phát hiện token bị đánh cắp (reuse detection) --------------------
async function detectTokenReuse(tokenHash, userId) {
  const record = await RefreshToken.findOne({ token: tokenHash });
  if (!record) return false;
  
  if (record.revoked) {
    // Token này đã bị revoke → có thể đã bị dùng lại bất hợp pháp
    // Revoke tất cả token của user để bảo vệ
    await revokeAllUserRefreshTokens(userId);
    logger.warn(`Token reuse detected for user ${userId}. All tokens revoked.`);
    return true;
  }
  return false;
}

module.exports = {
  authenticateToken,
  requireRole,
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
  detectTokenReuse,
};