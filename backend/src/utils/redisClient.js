const { createClient } = require('redis');
const { logger } = require('./logger');

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const defaultTTL = parseInt(process.env.REDIS_TTL) || 3600;

const client = createClient({
  url: redisUrl,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        logger.error('Redis reconnection failed after 10 attempts');
        return new Error('Max reconnection attempts reached');
      }
      return Math.min(retries * 100, 3000);
    },
  },
});

client.on('error', (err) => {
  logger.error('Redis Client Error:', err.message);
});

client.on('connect', () => {
  logger.info('🔌 Redis client connecting...');
});

client.on('ready', () => {
  logger.info('✅ Redis client connected and ready');
});

client.on('end', () => {
  logger.warn('Redis client connection closed');
});

client.on('reconnecting', () => {
  logger.info('Redis client reconnecting...');
});

async function connectRedis() {
  if (client.isOpen) return client;
  try {
    await client.connect();
    logger.info('✅ Connected to Redis successfully');
    return client;
  } catch (err) {
    logger.error('❌ Failed to connect to Redis:', err.message);
    return null;
  }
}

async function get(key) {
  try {
    if (!client.isOpen) await connectRedis();
    if (!client.isOpen) return null;
    const value = await client.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  } catch (err) {
    logger.error('Redis GET error:', err.message);
    return null;
  }
}

async function set(key, value, ttlSeconds = defaultTTL) {
  try {
    if (!client.isOpen) await connectRedis();
    if (!client.isOpen) return false;
    const storeVal = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttlSeconds > 0) {
      await client.setEx(key, ttlSeconds, storeVal);
    } else {
      await client.set(key, storeVal);
    }
    return true;
  } catch (err) {
    logger.error('Redis SET error:', err.message);
    return false;
  }
}

async function del(key) {
  try {
    if (!client.isOpen) await connectRedis();
    if (!client.isOpen) return false;
    await client.del(key);
    return true;
  } catch (err) {
    logger.error('Redis DEL error:', err.message);
    return false;
  }
}

async function keys(pattern) {
  try {
    if (!client.isOpen) await connectRedis();
    if (!client.isOpen) return [];
    return await client.keys(pattern);
  } catch (err) {
    logger.error('Redis KEYS error:', err.message);
    return [];
  }
}

async function flushAll() {
  try {
    if (!client.isOpen) await connectRedis();
    if (!client.isOpen) return false;
    await client.flushAll();
    logger.info('Redis cache flushed');
    return true;
  } catch (err) {
    logger.error('Redis FLUSHALL error:', err.message);
    return false;
  }
}

async function increment(key) {
  try {
    if (!client.isOpen) await connectRedis();
    if (!client.isOpen) return null;
    return await client.incr(key);
  } catch (err) {
    logger.error('Redis INCR error:', err.message);
    return null;
  }
}

async function hSet(key, field, value) {
  try {
    if (!client.isOpen) await connectRedis();
    if (!client.isOpen) return false;
    const storeVal = typeof value === 'string' ? value : JSON.stringify(value);
    await client.hSet(key, field, storeVal);
    return true;
  } catch (err) {
    logger.error('Redis HSET error:', err.message);
    return false;
  }
}

async function hGet(key, field) {
  try {
    if (!client.isOpen) await connectRedis();
    if (!client.isOpen) return null;
    const value = await client.hGet(key, field);
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  } catch (err) {
    logger.error('Redis HGET error:', err.message);
    return null;
  }
}

async function hGetAll(key) {
  try {
    if (!client.isOpen) await connectRedis();
    if (!client.isOpen) return null;
    const obj = await client.hGetAll(key);
    if (!obj || Object.keys(obj).length === 0) return null;
    const result = {};
    for (const [field, value] of Object.entries(obj)) {
      try {
        result[field] = JSON.parse(value);
      } catch {
        result[field] = value;
      }
    }
    return result;
  } catch (err) {
    logger.error('Redis HGETALL error:', err.message);
    return null;
  }
}

// --- Cache Wrapper (quan trọng) ---
function cacheWrapper(prefix, ttl = defaultTTL) {
  return async function (key, asyncFn, ...args) {
    const cacheKey = `${prefix}:${key}`;
    const cached = await get(cacheKey);
    if (cached !== null) {
      logger.debug(`Cache hit for key: ${cacheKey}`);
      return cached;
    }
    logger.debug(`Cache miss for key: ${cacheKey}`);
    const result = await asyncFn(...args);
    if (result !== null && result !== undefined) {
      await set(cacheKey, result, ttl);
    }
    return result;
  };
}

module.exports = {
  client,
  connectRedis,
  get,
  set,
  del,
  keys,
  flushAll,
  increment,
  hSet,
  hGet,
  hGetAll,
  cacheWrapper,
};