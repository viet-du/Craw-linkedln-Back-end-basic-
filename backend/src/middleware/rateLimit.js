const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { logger } = require('../utils/logger');
const { client: redisClient } = require('../utils/redisClient');

let store;
try {
  if (redisClient && redisClient.isOpen) {
    store = new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
      prefix: 'rate_limit:',
    });
    logger.info('✅ Using Redis store for rate limiting');
  }
} catch (err) {
  logger.warn('⚠️ Redis store not available, using memory store');
}

const createLimiter = (options) =>
  rateLimit({
    store,
    windowMs: options.windowMs || 15 * 60 * 1000,
    max: options.max || 100,
    message: {
      success: false,
      error: {
        message: options.message || 'Too many requests, please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: options.windowMs / 1000,
      },
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: options.skipSuccessful || false,
    skip: (req) => {
      if (req.user && req.user.role === 'admin') return true;
      if (req.path === '/health') return true;
      if (process.env.NODE_ENV === 'development' && req.ip === '::1') return true;
      return false;
    },
    keyGenerator: (req) => (req.user ? req.user.id : req.ip),
    handler: (req, res, next, options) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        url: req.originalUrl,
        userId: req.user ? req.user.id : 'anonymous',
      });
      res.status(options.statusCode || 429).json(options.message);
    },
  });

// Export các limiter
const authLimiter = createLimiter({ windowMs: 15 * 60 * 1000, max: 10, message: 'Too many login attempts' });
const searchLimiter = createLimiter({ windowMs: 15 * 60 * 1000, max: 100, message: 'Too many search requests', skipSuccessful: true });
const apiLimiter = createLimiter({ windowMs: 15 * 60 * 1000, max: 300, message: 'Too many API requests', skipSuccessful: true });
const uploadLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: 20, message: 'Too many file uploads' });
const candidateCreateLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: 50, message: 'Too many candidate creations', skipSuccessful: true });
const exportLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: 10, message: 'Too many export requests' });

module.exports = {
  authLimiter,
  searchLimiter,
  apiLimiter,
  uploadLimiter,
  candidateCreateLimiter,
  exportLimiter,
};