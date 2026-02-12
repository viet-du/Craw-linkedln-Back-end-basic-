const { logger } = require('../utils/logger');

// -------------------- Custom Error Classes --------------------
class AppError extends Error {
  constructor(message, statusCode, code, details) {
    super(message);
    this.statusCode = statusCode;
    this.code = code || 'APP_ERROR';
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details) {
    super(message || 'Validation failed', 400, 'VALIDATION_ERROR', details);
  }
}

class NotFoundError extends AppError {
  constructor(message, details) {
    super(message || 'Resource not found', 404, 'NOT_FOUND', details);
  }
}

class UnauthorizedError extends AppError {
  constructor(message, details) {
    super(message || 'Unauthorized', 401, 'UNAUTHORIZED', details);
  }
}

class ForbiddenError extends AppError {
  constructor(message, details) {
    super(message || 'Forbidden', 403, 'FORBIDDEN', details);
  }
}

class ConflictError extends AppError {
  constructor(message, details) {
    super(message || 'Conflict', 409, 'CONFLICT', details);
  }
}

class RateLimitError extends AppError {
  constructor(message, details) {
    super(message || 'Rate limit exceeded', 429, 'RATE_LIMIT_EXCEEDED', details);
  }
}

// -------------------- Async Handler Wrapper --------------------
const asyncErrorHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// -------------------- Global Error Handler --------------------
const errorHandler = (err, req, res, next) => {
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userId: req.user ? req.user.id : 'anonymous',
  });

  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let code = err.code || 'INTERNAL_SERVER_ERROR';
  let details = err.details || null;

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
    code = 'VALIDATION_ERROR';
    details = Object.values(err.errors).map(e => e.message);
  }

  // Mongoose cast error (invalid ID)
  if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid ID format';
    code = 'INVALID_ID';
  }

  // MongoDB duplicate key
  if (err.code === 11000) {
    statusCode = 409;
    message = 'Duplicate entry found';
    code = 'DUPLICATE_ENTRY';
    const field = Object.keys(err.keyValue)[0];
    details = { field, value: err.keyValue[field] };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
    code = 'INVALID_TOKEN';
  }
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
    code = 'TOKEN_EXPIRED';
  }

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      code,
      statusCode,
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
      ...(details && { details }),
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
};

module.exports = {
  errorHandler,
  asyncErrorHandler,
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
};