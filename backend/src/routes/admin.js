const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const User = require('../models/User');
const Candidate = require('../models/Candidate');
const {
  authenticateToken,
  requireRole,
  revokeAllUserRefreshTokens,
} = require('../middleware/auth');
const { uploadLimiter } = require('../middleware/rateLimit');
const { asyncErrorHandler, ValidationError, NotFoundError } = require('../middleware/errorHandler');
const DataQualityChecker = require('../utils/dataQuality');
const { logger } = require('../utils/logger');

// -------------------- Cấu hình multer --------------------
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = process.env.UPLOAD_PATH || './uploads';
    if (!require('fs').existsSync(uploadDir)) {
      require('fs').mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    if (path.extname(file.originalname).toLowerCase() === '.json') {
      cb(null, true);
    } else {
      cb(new ValidationError('Only JSON files are allowed'));
    }
  },
});

// -------------------- Lấy danh sách user --------------------
router.get('/users', authenticateToken, requireRole(['admin']), asyncErrorHandler(async (req, res) => {
  const users = await User.find({}, 'username role email isActive lastLogin createdAt updatedAt')
    .sort({ createdAt: -1 })
    .lean();
  res.json({ success: true, data: users, count: users.length });
}));

// -------------------- Tạo user mới --------------------
router.post('/users', authenticateToken, requireRole(['admin']), asyncErrorHandler(async (req, res) => {
  const { username, password, email, role } = req.body;
  if (!username || !password) throw new ValidationError('Username and password are required');

  const existingUser = await User.findOne({ username });
  if (existingUser) throw new ValidationError('Username already exists');

  const validRoles = ['user', 'admin'];
  if (role && !validRoles.includes(role)) {
    throw new ValidationError(`Role must be one of: ${validRoles.join(', ')}`);
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const user = new User({
    username,
    passwordHash: hashedPassword,
    email,
    role: role || 'user',
  });
  await user.save();

  logger.audit('User created by admin', {
    adminId: req.user.id,
    adminUsername: req.user.username,
    newUserId: user._id,
    newUsername: user.username,
    role: user.role,
    ip: req.ip,
  });

  res.status(201).json({
    success: true,
    message: 'User created successfully',
    data: {
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    },
  });
}));

// -------------------- Cập nhật user --------------------
router.put('/users/:id', authenticateToken, requireRole(['admin']), asyncErrorHandler(async (req, res) => {
  const { email, role, isActive, preferences } = req.body;
  const updates = {};
  if (email !== undefined) updates.email = email;
  if (role !== undefined) updates.role = role;
  if (isActive !== undefined) updates.isActive = isActive;
  if (preferences !== undefined) updates.preferences = preferences;

  if (role) {
    const validRoles = ['user', 'admin'];
    if (!validRoles.includes(role)) {
      throw new ValidationError(`Role must be one of: ${validRoles.join(', ')}`);
    }
  }

  const user = await User.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true, runValidators: true })
    .select('username role email isActive lastLogin createdAt updatedAt');

  if (!user) throw new NotFoundError('User not found');

  // Nếu vô hiệu hoá tài khoản -> thu hồi tất cả refresh token
  if (isActive === false) {
    await revokeAllUserRefreshTokens(user._id);
    logger.audit('All refresh tokens revoked due to account deactivation', {
      adminId: req.user.id,
      adminUsername: req.user.username,
      userId: user._id,
      username: user.username,
      ip: req.ip,
    });
  }

  logger.audit('User updated by admin', {
    adminId: req.user.id,
    adminUsername: req.user.username,
    userId: user._id,
    username: user.username,
    updates: Object.keys(updates),
    ip: req.ip,
  });

  res.json({ success: true, message: 'User updated successfully', data: user });
}));

// -------------------- Xoá user --------------------
router.delete('/users/:id', authenticateToken, requireRole(['admin']), asyncErrorHandler(async (req, res) => {
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) throw new NotFoundError('User not found');

  // Thu hồi tất cả refresh token trước khi xoá
  await revokeAllUserRefreshTokens(user._id);

  logger.audit('User deleted by admin', {
    adminId: req.user.id,
    adminUsername: req.user.username,
    deletedUserId: user._id,
    deletedUsername: user.username,
    ip: req.ip,
  });

  res.json({
    success: true,
    message: 'User deleted successfully',
    data: {
      id: user._id,
      username: user.username,
      deletedAt: new Date().toISOString(),
    },
  });
}));

// -------------------- Import candidates --------------------
router.post('/import', authenticateToken, requireRole(['admin']), uploadLimiter, upload.single('file'), asyncErrorHandler(async (req, res) => {
  if (!req.file) throw new ValidationError('No file uploaded');
  const filePath = req.file.path;

  try {
    const fileContent = await fs.readFile(filePath, 'utf8');
    const candidates = JSON.parse(fileContent);
    if (!Array.isArray(candidates)) throw new ValidationError('JSON file must contain an array of candidates');
    if (candidates.length > 1000) throw new ValidationError('Cannot import more than 1000 candidates at once');

    const results = { total: candidates.length, imported: 0, updated: 0, skipped: 0, errors: [] };

    for (let i = 0; i < candidates.length; i++) {
      const candidateData = candidates[i];
      try {
        const validation = DataQualityChecker.validateProfile(candidateData);
        if (!validation.isValid) {
          results.skipped++;
          results.errors.push({ index: i, name: candidateData.name || `Candidate ${i + 1}`, errors: validation.errors, warnings: validation.warnings });
          continue;
        }

        if (!candidateData.score) candidateData.score = 0;
        candidateData.data_quality_score = validation.qualityScore;

        let existingCandidate = null;
        if (candidateData.linkedin_url) {
          existingCandidate = await Candidate.findOne({ linkedin_url: candidateData.linkedin_url });
        }

        if (existingCandidate) {
          await Candidate.findByIdAndUpdate(existingCandidate._id, { $set: candidateData }, { new: true, runValidators: true });
          results.updated++;
        } else {
          const candidate = new Candidate(candidateData);
          await candidate.save();
          results.imported++;
        }

        if (candidates.length > 100 && (i + 1) % 100 === 0) {
          logger.info(`Import progress: ${i + 1}/${candidates.length}`);
        }
      } catch (error) {
        results.skipped++;
        results.errors.push({ index: i, name: candidateData.name || `Candidate ${i + 1}`, error: error.message });
        logger.error(`Error importing candidate at index ${i}:`, error);
      }
    }

    await fs.unlink(filePath);

    logger.audit('Candidates imported by admin', {
      adminId: req.user.id,
      adminUsername: req.user.username,
      file: req.file.originalname,
      total: results.total,
      imported: results.imported,
      updated: results.updated,
      skipped: results.skipped,
      errorCount: results.errors.length,
      ip: req.ip,
    });

    res.json({
      success: true,
      message: 'Import completed',
      data: results,
      summary: {
        successRate: (((results.imported + results.updated) / results.total) * 100).toFixed(2) + '%',
        totalProcessed: results.imported + results.updated,
      },
    });
  } catch (error) {
    try { await fs.unlink(filePath); } catch (cleanupError) { logger.error('Error cleaning up file:', cleanupError); }
    throw error;
  }
}));

// -------------------- Batch delete --------------------
router.delete('/batch', authenticateToken, requireRole(['admin']), asyncErrorHandler(async (req, res) => {
  const { filter, confirm } = req.body;
  if (!filter || Object.keys(filter).length === 0) throw new ValidationError('Filter is required for batch delete');
  if (!confirm) throw new ValidationError('Confirmation is required for batch delete');

  const count = await Candidate.countDocuments(filter);
  if (count === 0) throw new NotFoundError('No candidates found matching the filter');

  const result = await Candidate.deleteMany(filter);

  logger.audit('Batch delete performed by admin', {
    adminId: req.user.id,
    adminUsername: req.user.username,
    filter,
    deletedCount: result.deletedCount,
    ip: req.ip,
  });

  res.json({
    success: true,
    message: `Deleted ${result.deletedCount} candidates`,
    data: { deletedCount: result.deletedCount, filter, timestamp: new Date().toISOString() },
  });
}));

// -------------------- Batch update --------------------
router.patch('/batch', authenticateToken, requireRole(['admin']), asyncErrorHandler(async (req, res) => {
  const { filter, update, confirm } = req.body;
  if (!filter || Object.keys(filter).length === 0) throw new ValidationError('Filter is required for batch update');
  if (!update || Object.keys(update).length === 0) throw new ValidationError('Update data is required for batch update');
  if (!confirm) throw new ValidationError('Confirmation is required for batch update');

  const count = await Candidate.countDocuments(filter);
  if (count === 0) throw new NotFoundError('No candidates found matching the filter');

  const result = await Candidate.updateMany(filter, { $set: update });

  logger.audit('Batch update performed by admin', {
    adminId: req.user.id,
    adminUsername: req.user.username,
    filter,
    update,
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount,
    ip: req.ip,
  });

  res.json({
    success: true,
    message: `Updated ${result.modifiedCount} candidates`,
    data: { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount, filter, update, timestamp: new Date().toISOString() },
  });
}));

// -------------------- Export candidates to JSON --------------------
router.get('/export', authenticateToken, requireRole(['admin']), asyncErrorHandler(async (req, res) => {
  const { filter, format = 'json' } = req.query;
  let query = {};
  if (filter) {
    try {
      query = JSON.parse(filter);
    } catch (error) {
      throw new ValidationError('Invalid filter format');
    }
  }

  const candidates = await Candidate.find(query).select('-__v').lean();
  if (candidates.length === 0) throw new NotFoundError('No candidates found matching the filter');

  logger.audit('Candidates exported by admin', {
    adminId: req.user.id,
    adminUsername: req.user.username,
    filter: query,
    count: candidates.length,
    format,
    ip: req.ip,
  });

  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=candidates-export-${Date.now()}.json`);
    res.json(candidates);
  } else {
    throw new ValidationError('Unsupported export format');
  }
}));

// -------------------- System statistics --------------------
router.get('/statistics', authenticateToken, requireRole(['admin']), asyncErrorHandler(async (req, res) => {
  const [userStats, candidateStats, systemStats] = await Promise.all([
    User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } },
          lastWeek: { $sum: { $cond: [{ $gte: ['$lastLogin', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)] }, 1, 0] } },
        },
      },
    ]),
    Candidate.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          avgScore: { $avg: '$score' },
          avgExperience: { $avg: '$total_experience_count' },
          avgQuality: { $avg: '$data_quality_score' },
          byStatus: { $push: '$status' },
        },
      },
    ]),
    Promise.resolve({
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      cwd: process.cwd(),
      env: process.env.NODE_ENV,
    }),
  ]);

  const candidateStatusDistribution = {};
  if (candidateStats[0] && candidateStats[0].byStatus) {
    candidateStats[0].byStatus.forEach((status) => {
      candidateStatusDistribution[status] = (candidateStatusDistribution[status] || 0) + 1;
    });
  }

  const statistics = {
    users: {
      total: userStats.reduce((sum, role) => sum + role.count, 0),
      byRole: userStats.reduce((obj, role) => {
        obj[role._id] = { total: role.count, active: role.active, lastWeek: role.lastWeek };
        return obj;
      }, {}),
      activePercentage: (userStats.reduce((sum, role) => sum + role.active, 0) /
        userStats.reduce((sum, role) => sum + role.count, 0)) *
        100,
    },
    candidates: {
      total: candidateStats[0]?.total || 0,
      avgScore: candidateStats[0]?.avgScore || 0,
      avgExperience: candidateStats[0]?.avgExperience || 0,
      avgQuality: candidateStats[0]?.avgQuality || 0,
      statusDistribution: candidateStatusDistribution,
    },
    system: systemStats,
    timestamp: new Date().toISOString(),
  };

  res.json({ success: true, data: statistics });
}));

// -------------------- Clear cache --------------------
router.post('/clear-cache', authenticateToken, requireRole(['admin']), asyncErrorHandler(async (req, res) => {
  const { cacheType } = req.body;
  let cleared = 0;
  let message = '';

  try {
    const { client: redisClient } = require('../utils/redisClient');

    if (cacheType === 'all' || cacheType === 'candidates') {
      const keys = await redisClient.keys('candidates:*');
      if (keys.length > 0) {
        await redisClient.del(keys);
        cleared += keys.length;
      }
      message += `Cleared ${keys.length} candidate cache keys. `;
    }

    if (cacheType === 'all' || cacheType === 'users') {
      const keys = await redisClient.keys('users:*');
      if (keys.length > 0) {
        await redisClient.del(keys);
        cleared += keys.length;
      }
      message += `Cleared ${keys.length} user cache keys. `;
    }

    if (cacheType === 'all' || cacheType === 'rate_limit') {
      const keys = await redisClient.keys('rate_limit:*');
      if (keys.length > 0) {
        await redisClient.del(keys);
        cleared += keys.length;
      }
      message += `Cleared ${keys.length} rate limit keys. `;
    }

    logger.audit('Cache cleared by admin', {
      adminId: req.user.id,
      adminUsername: req.user.username,
      cacheType,
      clearedCount: cleared,
      ip: req.ip,
    });

    res.json({ success: true, message: message || 'Cache cleared', data: { clearedCount: cleared, cacheType, timestamp: new Date().toISOString() } });
  } catch (error) {
    logger.error('Error clearing cache:', error);
    throw new Error('Failed to clear cache');
  }
}));

// -------------------- Data quality report --------------------
router.get('/data-quality-report', authenticateToken, requireRole(['admin']), asyncErrorHandler(async (req, res) => {
  const { limit = 1000 } = req.query;
  const candidates = await Candidate.find()
    .limit(parseInt(limit))
    .select('name job_title location linkedin_url experience education skills score data_quality_score')
    .lean();
  const report = DataQualityChecker.generateDataQualityReport(candidates);
  res.json({ success: true, data: report });
}));

module.exports = router;