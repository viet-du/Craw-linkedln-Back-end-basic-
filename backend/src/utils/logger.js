const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let metaString = '';
    if (Object.keys(meta).length > 0) {
      metaString = ' ' + JSON.stringify(meta);
    }
    return `[${timestamp}] ${level}: ${message}${metaString}`;
  })
);

// Custom format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: fileFormat,
  transports: [
    // Error logs
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 10,
    }),
    // Combined logs
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 10,
    }),
    // HTTP request logs
    new winston.transports.File({
      filename: path.join(logsDir, 'http.log'),
      level: 'http',
      maxsize: 5242880,
      maxFiles: 10,
    }),
    // Audit logs (for security events)
    new winston.transports.File({
      filename: path.join(logsDir, 'audit.log'),
      level: 'audit',
      maxsize: 5242880,
      maxFiles: 10,
    }),
  ],
});

// Add console transport in non-production environments
if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: consoleFormat,
    })
  );
}

// Add a custom audit level
logger.audit = function(message, meta = {}) {
  this.log({
    level: 'audit',
    message,
    ...meta,
    timestamp: new Date().toISOString(),
    type: 'AUDIT',
    userId: meta.userId || 'system',
    action: meta.action || 'unknown',
    ip: meta.ip || 'unknown',
    userAgent: meta.userAgent || 'unknown',
  });
};

// Add a custom HTTP level
logger.http = function(message, meta = {}) {
  this.log({
    level: 'http',
    message,
    ...meta,
    timestamp: new Date().toISOString(),
    type: 'HTTP',
    method: meta.method || 'GET',
    url: meta.url || '/',
    statusCode: meta.statusCode || 200,
    duration: meta.duration || 0,
    ip: meta.ip || 'unknown',
  });
};

// Middleware for logging HTTP requests
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Skip health checks in production
  if (process.env.NODE_ENV === 'production' && req.path === '/health') {
    return next();
  }
  
  // Log request details
  logger.http('Incoming request', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length'),
  });
  
  // Capture response finish
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'warn' : 'http';
    
    logger[logLevel]('Request completed', {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userId: req.user ? req.user.id : 'anonymous',
      userAgent: req.get('User-Agent'),
      contentLength: res.get('Content-Length'),
    });
    
    // Log 4xx and 5xx errors separately
    if (res.statusCode >= 400) {
      logger.error('Error response', {
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        error: res.statusMessage,
        userId: req.user ? req.user.id : 'anonymous',
        ip: req.ip,
      });
    }
  });
  
  next();
};

// Error logging middleware
const errorLogger = (err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userId: req.user ? req.user.id : 'anonymous',
    body: req.body,
    query: req.query,
    params: req.params,
  });
  
  next(err);
};

// Performance logging
const performanceLogger = (operation, startTime) => {
  const duration = Date.now() - startTime;
  if (duration > 1000) { // Log slow operations (>1s)
    logger.warn('Slow operation detected', {
      operation,
      duration: `${duration}ms`,
      threshold: '1000ms',
    });
  }
  return duration;
};

module.exports = {
  logger,
  requestLogger,
  errorLogger,
  performanceLogger,
};