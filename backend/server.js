require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');

// ---------- 1. KHỞI TẠO APP ----------
const app = express();

// ---------- 2. MIDDLEWARE CƠ BẢN ----------
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'self'", "'unsafe-inline'"], // ✅ CHO PHÉP INLINE EVENT HANDLER (onclick...)
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://yourdomain.com']
    : ['http://localhost:3000'],
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(mongoSanitize());

// ---------- 3. STATIC FILES ----------
app.use('/data', express.static(path.join(__dirname, '../data')));
app.use('/uploads', express.static('uploads'));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- 4. IMPORT CÁC MODULE NỘI BỘ (SAU KHI APP ĐÃ TỒN TẠI) ----------
const { logger, requestLogger } = require('./src/utils/logger');
const { errorHandler, asyncErrorHandler } = require('./src/middleware/errorHandler');
const { connectRedis } = require('./src/utils/redisClient');
const { authenticateToken } = require('./src/middleware/auth');

// ---------- 5. IMPORT ROUTES ----------
const authRoutes = require('./src/routes/auth');
const candidateRoutes = require('./src/routes/candidates');
const adminRoutes = require('./src/routes/admin');
const exportRoutes = require('./src/routes/export');

// ---------- 6. REQUEST LOGGER ----------
app.use(requestLogger);

// ---------- 7. GẮN ROUTES ----------
app.use('/api/auth', authRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/export', exportRoutes);

// ---------- 8. ENDPOINT THỐNG KÊ CHO DASHBOARD ----------
app.get('/api/statistics', authenticateToken, asyncErrorHandler(async (req, res) => {
  const Candidate = require('./src/models/Candidate');
  const totalCandidates = await Candidate.countDocuments();
  const avgExperience = await Candidate.aggregate([
    { $group: { _id: null, avg: { $avg: '$total_experience_count' } } },
  ]);
  const avgScore = await Candidate.aggregate([
    { $group: { _id: null, avg: { $avg: '$score' } } },
  ]);
  const avgQuality = await Candidate.aggregate([
    { $group: { _id: null, avg: { $avg: '$data_quality_score' } } },
  ]);

  res.json({
    success: true,
    data: {
      totalCandidates,
      avgExperience: avgExperience[0]?.avg || 0,
      avgScore: avgScore[0]?.avg || 0,
      avgQuality: avgQuality[0]?.avg || 0,
    },
  });
}));

// ---------- 9. HEALTH CHECK ----------
app.get('/health', async (req, res) => {
  try {
    const mongoStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    const Candidate = require('./src/models/Candidate');
    const count = await Candidate.countDocuments();

    const redis = require('./src/utils/redisClient');
    let redisStatus = 'disconnected';
    try {
      const redisClient = redis.client;
      if (redisClient && redisClient.isOpen) {
        await redisClient.ping();
        redisStatus = 'connected';
      }
    } catch (redisErr) {
      logger.error('Redis health check failed:', redisErr);
    }

    res.json({
      status: 'OK',
      services: { mongodb: mongoStatus, redis: redisStatus, uptime: process.uptime() },
      data: { candidatesCount: count, lastUpdated: new Date().toISOString() },
    });
  } catch (error) {
    logger.error('Health check error:', error);
    res.status(500).json({ status: 'ERROR', error: error.message });
  }
});

// ---------- 10. WELCOME PAGE & API DOCS ----------
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api-docs', (req, res) => {
  res.json({
    name: 'LinkedIn Candidates API',
    version: '1.0.0',
    endpoints: {
      auth: {
        login: 'POST /api/auth/login',
        register: 'POST /api/auth/register',
        refresh: 'POST /api/auth/refresh',
        logout: 'POST /api/auth/logout',
        me: 'GET /api/auth/me',
      },
      candidates: {
        list: 'GET /api/candidates',
        search: 'GET /api/candidates/search?q=keyword',
        advanced: 'GET /api/candidates/advanced-search',
        topByExperience: 'GET /api/candidates/top/experience',
        topByEducation: 'GET /api/candidates/top/education',
        statistics: 'GET /api/candidates/statistics/summary',
        distributions: 'GET /api/candidates/statistics/distributions?type=...',
        getById: 'GET /api/candidates/:id',
        create: 'POST /api/candidates',
        update: 'PUT /api/candidates/:id',
        delete: 'DELETE /api/candidates/:id',
        validate: 'POST /api/candidates/validate',
        batchValidate: 'POST /api/candidates/batch-validate',
      },
      admin: {
        users: 'GET /api/admin/users',
        createUser: 'POST /api/admin/users',
        updateUser: 'PUT /api/admin/users/:id',
        deleteUser: 'DELETE /api/admin/users/:id',
        import: 'POST /api/admin/import',
        batchDelete: 'DELETE /api/admin/batch',
        batchUpdate: 'PATCH /api/admin/batch',
        export: 'GET /api/admin/export',
        statistics: 'GET /api/admin/statistics',
        clearCache: 'POST /api/admin/clear-cache',
        dataQualityReport: 'GET /api/admin/data-quality-report',
      },
      export: {
        csv: 'GET /api/export/csv',
        excel: 'GET /api/export/excel',
        json: 'GET /api/export/json',
        withPhotos: 'GET /api/export/with-photos',
        bulk: 'GET /api/export/bulk',
      },
    },
  });
});

// ---------- 11. ERROR HANDLER ----------
app.use(errorHandler);

// ---------- 12. KẾT NỐI DATABASE VÀ START SERVER ----------
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  })
  .then(async () => {
    logger.info('✅ Connected to MongoDB');

    await connectRedis();

    await initializeAdminUser();

    const Candidate = require('./src/models/Candidate');
    const count = await Candidate.countDocuments();
    logger.info(`📊 Total candidates in database: ${count}`);

    const PORT = process.env.PORT || 3000; // 👈 ĐỔI LẠI THÀNH 3000
    const server = app.listen(PORT, () => {
      logger.info(`🚀 Server running on http://localhost:${PORT}`);
      logger.info(`📊 Health check: http://localhost:${PORT}/health`);
      logger.info(`📚 API Docs: http://localhost:${PORT}/api-docs`);
    });

    setupGracefulShutdown(server);
  })
  .catch((err) => {
    logger.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

async function initializeAdminUser() {
  try {
    const User = require('./src/models/User');
    const bcrypt = require('bcryptjs');

    const adminExists = await User.findOne({ username: process.env.ADMIN_USERNAME || 'admin' });

    if (!adminExists) {
      const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 12);
      const adminUser = new User({
        username: process.env.ADMIN_USERNAME || 'admin',
        passwordHash: hashedPassword,
        role: 'admin',
        isActive: true,
        email: process.env.ADMIN_EMAIL || 'admin@example.com',
      });
      await adminUser.save();
      logger.info('👑 Admin user created successfully');
    } else {
      logger.info('👑 Admin user already exists');
    }
  } catch (error) {
    logger.error('Failed to initialize admin user:', error);
  }
}

function setupGracefulShutdown(server) {
  const shutdown = async (signal) => {
    logger.info(`${signal} received. Starting graceful shutdown...`);

    server.close(async () => {
      logger.info('HTTP server closed');

      try {
        await mongoose.connection.close();
        logger.info('MongoDB connection closed');
      } catch (err) {
        logger.error('Error closing MongoDB connection:', err);
      }

      try {
        const { client } = require('./src/utils/redisClient');
        if (client && client.isOpen) {
          await client.quit();
          logger.info('Redis connection closed');
        }
      } catch (err) {
        logger.error('Error closing Redis connection:', err);
      }

      logger.info('Graceful shutdown completed');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}