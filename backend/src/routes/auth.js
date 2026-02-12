const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const {
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
} = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');
const { asyncErrorHandler, ValidationError } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');
const { client: redisClient } = require('../utils/redisClient');

// -------------------- Đăng nhập --------------------
router.post('/login', authLimiter, asyncErrorHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    throw new ValidationError('Username and password required', { code: 'MISSING_CREDENTIALS' });
  }

  const user = await User.findOne({ username });
  if (!user) {
    return res.status(401).json({ success: false, error: { message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' } });
  }

  if (user.isLocked()) {
    return res.status(403).json({ success: false, error: { message: 'Account locked', code: 'ACCOUNT_LOCKED' } });
  }

  if (!user.isActive) {
    return res.status(403).json({ success: false, error: { message: 'Account inactive', code: 'ACCOUNT_INACTIVE' } });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    await user.incLoginAttempts();
    return res.status(401).json({ success: false, error: { message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' } });
  }

  await user.resetLoginAttempts();
  await user.updateLastLogin();

  const accessToken = generateToken(user);
  const refreshToken = await generateRefreshToken(user, req.headers['user-agent'] || 'unknown');

  res.json({
    success: true,
    data: {
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        email: user.email,
        preferences: user.preferences,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: 8 * 60 * 60,
      },
    },
  });
}));

// -------------------- Đăng ký --------------------
router.post('/register', authLimiter, asyncErrorHandler(async (req, res) => {
  const { username, password, email } = req.body;
  if (!username || !password) {
    throw new ValidationError('Username and password required', { code: 'MISSING_CREDENTIALS' });
  }

  if (username.length < 3 || username.length > 30) {
    throw new ValidationError('Username must be 3-30 characters', { code: 'INVALID_USERNAME_LENGTH' });
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    throw new ValidationError('Username only letters, numbers, underscore', { code: 'INVALID_USERNAME_FORMAT' });
  }

  if (password.length < 8) {
    throw new ValidationError('Password must be at least 8 characters', { code: 'PASSWORD_TOO_SHORT' });
  }

  if (email && !/^\S+@\S+\.\S+$/.test(email)) {
    throw new ValidationError('Invalid email format', { code: 'INVALID_EMAIL' });
  }

  const existingUser = await User.findOne({ username });
  if (existingUser) {
    return res.status(409).json({ success: false, error: { message: 'Username already exists', code: 'USERNAME_EXISTS' } });
  }

  if (email) {
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(409).json({ success: false, error: { message: 'Email already exists', code: 'EMAIL_EXISTS' } });
    }
  }

  const hashed = await bcrypt.hash(password, 12);
  const user = new User({
    username,
    passwordHash: hashed,
    email: email || null,
    role: 'user',
  });
  await user.save();

  const accessToken = generateToken(user);
  const refreshToken = await generateRefreshToken(user, req.headers['user-agent'] || 'unknown');

  res.status(201).json({
    success: true,
    data: {
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        email: user.email,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: 8 * 60 * 60,
      },
    },
  });
}));

// -------------------- Refresh token --------------------
router.post('/refresh', asyncErrorHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    throw new ValidationError('Refresh token required', { code: 'MISSING_REFRESH_TOKEN' });
  }

  try {
    const decoded = await verifyRefreshToken(refreshToken);
    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, error: { message: 'Invalid refresh token', code: 'INVALID_REFRESH_TOKEN' } });
    }

    // Thu hồi token cũ
    await revokeRefreshToken(refreshToken);

    const newAccessToken = generateToken(user);
    const newRefreshToken = await generateRefreshToken(user, req.headers['user-agent'] || 'unknown');

    res.json({
      success: true,
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: 8 * 60 * 60,
      },
    });
  } catch (error) {
    res.status(401).json({ success: false, error: { message: 'Invalid refresh token', code: 'INVALID_REFRESH_TOKEN' } });
  }
}));

// -------------------- Logout (thu hồi cả access và refresh) --------------------
router.post('/logout', asyncErrorHandler(async (req, res) => {
  const authHeader = req.headers['authorization'];
  const accessToken = authHeader && authHeader.split(' ')[1];
  const { refreshToken } = req.body;

  // Blacklist access token
  if (accessToken && redisClient && redisClient.isOpen) {
    try {
      const decoded = jwt.decode(accessToken);
      if (decoded && decoded.exp) {
        const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);
        if (expiresIn > 0) {
          await redisClient.setEx(`blacklist:${accessToken}`, expiresIn, '1');
        }
      }
    } catch (e) {
      logger.error('Error blacklisting access token', e);
    }
  }

  // Thu hồi refresh token
  if (refreshToken) {
    await revokeRefreshToken(refreshToken);
  }

  logger.audit('Logout', { userId: req.user?.id, ip: req.ip });
  res.json({ success: true, message: 'Logout successful' });
}));

// -------------------- Lấy thông tin user hiện tại --------------------
router.get('/me', asyncErrorHandler(async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { message: 'Not authenticated', code: 'NOT_AUTHENTICATED' } });
  }
  const user = await User.findById(req.user.id).select('-passwordHash -loginAttempts -lockUntil -apiKey');
  if (!user) {
    return res.status(404).json({ success: false, error: { message: 'User not found', code: 'USER_NOT_FOUND' } });
  }
  res.json({ success: true, data: user });
}));

module.exports = router;