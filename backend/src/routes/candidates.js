const express = require('express');
const router = express.Router();
const Candidate = require('../models/Candidate');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { searchLimiter, apiLimiter, candidateCreateLimiter } = require('../middleware/rateLimit');
const { asyncErrorHandler, NotFoundError, ValidationError } = require('../middleware/errorHandler');
const DataQualityChecker = require('../utils/dataQuality');
const { logger } = require('../utils/logger');
const { cacheWrapper } = require('../utils/redisClient');

const candidateCache = cacheWrapper('candidates', 300);

// ============================================================================
// 1. CÁC ROUTE CỤ THỂ – ĐẶT TRƯỚC ROUTE /:id
// ============================================================================

// ---------- Thống kê & phân bố ----------
router.get('/statistics/summary', authenticateToken, apiLimiter, asyncErrorHandler(async (req, res) => {
  const stats = await Candidate.getStats();
  res.json({ success: true, data: stats });
}));

router.get('/statistics/distributions', authenticateToken, apiLimiter, asyncErrorHandler(async (req, res) => {
  const { type, limit = 10 } = req.query;
  const validTypes = ['job_title', 'skills', 'location', 'education_level'];
  if (!validTypes.includes(type)) {
    throw new ValidationError('Invalid distribution type. Must be one of: ' + validTypes.join(', '));
  }

  let pipeline = [];
  switch (type) {
    case 'job_title':
      pipeline = [
        { $match: { job_title: { $ne: null, $ne: '' } } },
        { $group: { _id: '$job_title', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: parseInt(limit) }
      ];
      break;
    case 'skills':
      pipeline = [
        { $unwind: '$skills' },
        { $group: { _id: '$skills', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: parseInt(limit) }
      ];
      break;
    case 'location':
      pipeline = [
        { $match: { location: { $ne: null, $ne: '' } } },
        { $group: { _id: '$location', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: parseInt(limit) }
      ];
      break;
    case 'education_level':
      pipeline = [
        { $unwind: '$education' },
        { $group: { _id: '$education.degree_level', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ];
      break;
  }

  const data = await Candidate.aggregate(pipeline);
  const total = await Candidate.countDocuments({});

  const result = data.map(item => ({
    label: item._id || 'Unknown',
    count: item.count,
    percentage: total > 0 ? Number(((item.count / total) * 100).toFixed(2)) : 0
  }));

  res.json({ success: true, data: result, total, type });
}));

// ---------- Tìm kiếm cơ bản ----------
router.get('/search', authenticateToken, searchLimiter, asyncErrorHandler(async (req, res) => {
  const query = req.query.q;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  if (!query || query.trim() === '') {
    throw new ValidationError('Search query is required');
  }
  if (limit < 1 || limit > 1000) {
    throw new ValidationError('Limit must be between 1 and 1000 for search');
  }

  const searchQuery = {
    $or: [
      { name: { $regex: query, $options: 'i' } },
      { job_title: { $regex: query, $options: 'i' } },
      { location: { $regex: query, $options: 'i' } },
      { skills: { $in: [new RegExp(query, 'i')] } },
      { 'education.school': { $regex: query, $options: 'i' } },
      { 'education.degree': { $regex: query, $options: 'i' } },
      { 'experience.position': { $regex: query, $options: 'i' } },
      { 'experience.company': { $regex: query, $options: 'i' } }
    ]
  };

  const [candidates, total] = await Promise.all([
    Candidate.find(searchQuery).sort({ score: -1 }).skip(skip).limit(limit).select('-__v').lean(),
    Candidate.countDocuments(searchQuery)
  ]);

  res.json({
    success: true,
    data: candidates,
    pagination: { page, limit, total, pages: Math.ceil(total / limit), hasNext: page < Math.ceil(total / limit), hasPrev: page > 1 },
    search: { query, results: candidates.length }
  });
}));

// ---------- Tìm kiếm nâng cao ----------
router.get('/advanced-search', authenticateToken, searchLimiter, asyncErrorHandler(async (req, res) => {
  const {
    q, minExperience, maxExperience, educationLevels, skills,
    location, minScore, maxScore, employmentTypes,
    page = 1, limit = 20, sortBy = 'score', sortOrder = 'desc'
  } = req.query;

  if (limit < 1 || limit > 50) throw new ValidationError('Limit must be between 1 and 50');

  const skip = (page - 1) * limit;
  const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
  const query = {};

  if (q && q.trim() !== '') {
    query.$or = [
      { name: { $regex: q, $options: 'i' } },
      { job_title: { $regex: q, $options: 'i' } },
      { location: { $regex: q, $options: 'i' } },
      { skills: { $in: [new RegExp(q, 'i')] } }
    ];
  }

  if (minExperience || maxExperience) {
    query.total_experience_count = {};
    if (minExperience) query.total_experience_count.$gte = parseInt(minExperience);
    if (maxExperience) query.total_experience_count.$lte = parseInt(maxExperience);
  }

  if (educationLevels) {
    const levels = educationLevels.split(',');
    query['education.degree_level'] = { $in: levels };
  }

  if (skills) {
    const skillArray = skills.split(',').map(s => s.trim());
    query.skills = { $all: skillArray.map(s => new RegExp(s, 'i')) };
  }

  if (location) query.location = { $regex: location, $options: 'i' };
  if (minScore || maxScore) {
    query.score = {};
    if (minScore) query.score.$gte = parseInt(minScore);
    if (maxScore) query.score.$lte = parseInt(maxScore);
  }
  if (employmentTypes) {
    const types = employmentTypes.split(',');
    query['experience.employment_type'] = { $in: types };
  }

  const cacheKey = `advanced:${JSON.stringify(query)}:${page}:${limit}:${sortBy}:${sortOrder}`;
  const result = await candidateCache(cacheKey, async () => {
    const [candidates, total] = await Promise.all([
      Candidate.find(query).sort(sort).skip(skip).limit(limit).select('-__v').lean(),
      Candidate.countDocuments(query)
    ]);
    const stats = await Candidate.aggregate([
      { $match: query },
      { $group: { _id: null, avgScore: { $avg: '$score' }, avgExperience: { $avg: '$total_experience_count' }, avgQuality: { $avg: '$data_quality_score' }, count: { $sum: 1 } } }
    ]);
    return { candidates, total, stats: stats[0] || {} };
  });

  res.json({
    success: true,
    data: result.candidates,
    pagination: { page: parseInt(page), limit: parseInt(limit), total: result.total, pages: Math.ceil(result.total / limit), hasNext: page < Math.ceil(result.total / limit), hasPrev: page > 1 },
    statistics: { totalResults: result.total, avgScore: result.stats.avgScore || 0, avgExperience: result.stats.avgExperience || 0, avgQuality: result.stats.avgQuality || 0 },
    filtersApplied: Object.keys(req.query).filter(k => !['page', 'limit', 'sortBy', 'sortOrder'].includes(k))
  });
}));

// ---------- Top theo kinh nghiệm ----------
router.get('/top/experience', authenticateToken, apiLimiter, asyncErrorHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  if (limit < 1 || limit > 1000) throw new ValidationError('Limit must be between 1 and 1000');

  const cacheKey = `top_experience:${limit}`;
  const candidates = await candidateCache(cacheKey, async () => {
    return Candidate.find().sort({ total_experience_count: -1, score: -1 }).limit(limit).select('-__v').lean();
  });

  res.json({
    success: true,
    data: candidates,
    summary: {
      total: candidates.length,
      maxExperience: candidates[0]?.total_experience_count || 0,
      minExperience: candidates[candidates.length - 1]?.total_experience_count || 0,
      avgExperience: candidates.reduce((sum, c) => sum + (c.total_experience_count || 0), 0) / candidates.length
    }
  });
}));

// ---------- Top theo học vấn ----------
router.get('/top/education', authenticateToken, apiLimiter, asyncErrorHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const educationLevel = req.query.level || 'PhD';

  if (limit < 1 || limit > 1000) throw new ValidationError('Limit must be between 1 and 1000');
  const validLevels = ['PhD', 'Master', 'MBA', 'Bachelor', 'High School'];
  if (!validLevels.includes(educationLevel)) {
    throw new ValidationError(`Education level must be one of: ${validLevels.join(', ')}`);
  }

  const cacheKey = `top_education:${educationLevel}:${limit}`;
  const candidates = await candidateCache(cacheKey, async () => {
    return Candidate.find({ 'education.degree_level': educationLevel }).sort({ score: -1 }).limit(limit).select('-__v').lean();
  });

  res.json({
    success: true,
    data: candidates,
    summary: { educationLevel, total: candidates.length, avgScore: candidates.reduce((sum, c) => sum + (c.score || 0), 0) / candidates.length || 0 }
  });
}));

// ---------- Validate dữ liệu ----------
router.post('/validate', authenticateToken, asyncErrorHandler(async (req, res) => {
  const validation = DataQualityChecker.validateProfile(req.body);
  res.json({ success: true, data: validation });
}));

// ---------- Batch validate ----------
router.post('/batch-validate', authenticateToken, requireRole(['admin']), asyncErrorHandler(async (req, res) => {
  const candidates = req.body;
  if (!Array.isArray(candidates)) throw new ValidationError('Request body must be an array of candidates');
  if (candidates.length > 100) throw new ValidationError('Batch size cannot exceed 100 candidates');
  const report = DataQualityChecker.generateDataQualityReport(candidates);
  res.json({ success: true, data: report });
}));

// ============================================================================
// 2. ROUTE LẤY DANH SÁCH – CŨNG LÀ ROUTE CỤ THỂ (/) NHƯNG KHÔNG XUNG ĐỘT
// ============================================================================
router.get('/', authenticateToken, apiLimiter, asyncErrorHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const sortBy = req.query.sortBy || 'score';
  const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

  if (page < 1) throw new ValidationError('Page must be greater than 0');
  if (limit < 1 || limit > 10000) throw new ValidationError('Limit must be between 1 and 10000');

  const skip = (page - 1) * limit;
  const sort = { [sortBy]: sortOrder };
  const query = {};

  if (req.query.status) query.status = req.query.status;
  if (req.query.minQuality) query.data_quality_score = { $gte: parseInt(req.query.minQuality) };
  if (req.query.minExperience || req.query.maxExperience) {
    query.total_experience_count = {};
    if (req.query.minExperience) query.total_experience_count.$gte = parseInt(req.query.minExperience);
    if (req.query.maxExperience) query.total_experience_count.$lte = parseInt(req.query.maxExperience);
  }

  const cacheKey = `list:${page}:${limit}:${sortBy}:${sortOrder}:${JSON.stringify(query)}`;
  const result = await candidateCache(cacheKey, async () => {
    const [candidates, total] = await Promise.all([
      Candidate.find(query).sort(sort).skip(skip).limit(limit).select('-__v').lean(),
      Candidate.countDocuments(query)
    ]);
    return { candidates, total };
  });

  res.json({
    success: true,
    data: result.candidates,
    pagination: { page, limit, total: result.total, pages: Math.ceil(result.total / limit), hasNext: page < Math.ceil(result.total / limit), hasPrev: page > 1 },
    sort: { by: sortBy, order: sortOrder === 1 ? 'asc' : 'desc' }
  });
}));

// ============================================================================
// 3. CÁC ROUTE CRUD CÓ THAM SỐ ĐỘNG – ĐẶT CUỐI CÙNG
// ============================================================================

// ---------- Lấy chi tiết ứng viên theo ID ----------
router.get('/:id', authenticateToken, apiLimiter, asyncErrorHandler(async (req, res) => {
  const candidate = await Candidate.findById(req.params.id).select('-__v').lean();
  if (!candidate) throw new NotFoundError('Candidate not found');
  res.json({ success: true, data: candidate });
}));

// ---------- Tạo mới ----------
router.post('/', authenticateToken, requireRole(['admin', 'user']), candidateCreateLimiter, asyncErrorHandler(async (req, res) => {
  const candidateData = req.body;
  const validation = DataQualityChecker.validateProfile(candidateData);
  if (!validation.isValid) {
    throw new ValidationError('Candidate data validation failed', validation.errors);
  }

  if (candidateData.linkedin_url) {
    const existing = await Candidate.findOne({ linkedin_url: candidateData.linkedin_url });
    if (existing) {
      throw new ValidationError('Candidate with this LinkedIn URL already exists', {
        existingId: existing._id,
        linkedin_url: candidateData.linkedin_url
      });
    }
  }

  if (!candidateData.score) candidateData.score = 0;
  candidateData.data_quality_score = validation.qualityScore;

  const candidate = new Candidate(candidateData);
  await candidate.save();

  res.status(201).json({
    success: true,
    message: 'Candidate created successfully',
    data: candidate,
    validation: { qualityScore: validation.qualityScore, warnings: validation.warnings }
  });
}));

// ---------- Cập nhật ----------
router.put('/:id', authenticateToken, requireRole(['admin']), asyncErrorHandler(async (req, res) => {
  const updateData = req.body;

  if (updateData.name || updateData.job_title || updateData.linkedin_url) {
    const candidate = await Candidate.findById(req.params.id).lean();
    if (!candidate) throw new NotFoundError('Candidate not found');
    const mergedData = { ...candidate, ...updateData };
    const validation = DataQualityChecker.validateProfile(mergedData);
    if (!validation.isValid) {
      throw new ValidationError('Candidate data validation failed', validation.errors);
    }
    updateData.data_quality_score = validation.qualityScore;
  }

  const candidate = await Candidate.findByIdAndUpdate(
    req.params.id,
    { $set: updateData },
    { new: true, runValidators: true }
  ).select('-__v');

  if (!candidate) throw new NotFoundError('Candidate not found');

  res.json({ success: true, message: 'Candidate updated successfully', data: candidate });
}));

// ---------- Xoá ----------
router.delete('/:id', authenticateToken, requireRole(['admin']), asyncErrorHandler(async (req, res) => {
  const candidate = await Candidate.findByIdAndDelete(req.params.id);
  if (!candidate) throw new NotFoundError('Candidate not found');

  res.json({
    success: true,
    message: 'Candidate deleted successfully',
    data: { id: candidate._id, name: candidate.name, deletedAt: new Date().toISOString() }
  });
}));

module.exports = router;