require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Kết nối MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('✅ Connected to MongoDB');
  
  // Kiểm tra số lượng documents
  const Candidate = require('./src/models/Candidate');
  Candidate.countDocuments()
    .then(count => {
      console.log(`📊 Total candidates in database: ${count}`);
    });
})
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
});

// Routes đơn giản
const Candidate = require('./src/models/Candidate');

// API: Lấy tất cả candidates
app.get('/api/candidates', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const candidates = await Candidate.find()
      .sort({ score: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Candidate.countDocuments();
    
    res.json({
      success: true,
      data: candidates,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Tìm kiếm candidates
app.get('/api/candidates/search', async (req, res) => {
  try {
    const query = req.query.q;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    let searchQuery = {};
    
    if (query) {
      searchQuery = {
        $or: [
          { name: { $regex: query, $options: 'i' } },
          { job_title: { $regex: query, $options: 'i' } },
          { location: { $regex: query, $options: 'i' } },
          { skills: { $in: [new RegExp(query, 'i')] } }
        ]
      };
    }
    
    const candidates = await Candidate.find(searchQuery)
      .sort({ score: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Candidate.countDocuments(searchQuery);
    
    res.json({
      success: true,
      data: candidates,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Top candidates theo kinh nghiệm
app.get('/api/candidates/top/experience', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    
    const candidates = await Candidate.find()
      .sort({ total_experience_count: -1, score: -1 })
      .limit(limit);
    
    res.json({
      success: true,
      data: candidates
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Top candidates theo học vấn
app.get('/api/candidates/top/education', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    
    const candidates = await Candidate.find({
      'education.degree_level': { $in: ['PhD', 'Master', 'MBA'] }
    })
    .sort({ score: -1 })
    .limit(limit);
    
    res.json({
      success: true,
      data: candidates
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Thống kê
app.get('/api/statistics', async (req, res) => {
  try {
    const Candidate = require('./src/models/Candidate');
    
    const totalCandidates = await Candidate.countDocuments();
    const avgExperience = await Candidate.aggregate([
      { $group: { _id: null, avg: { $avg: '$total_experience_count' } } }
    ]);
    const avgScore = await Candidate.aggregate([
      { $group: { _id: null, avg: { $avg: '$score' } } }
    ]);
    
    // Top skills
    const topSkills = await Candidate.aggregate([
      { $unwind: '$skills' },
      { $group: { _id: '$skills', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    // Top locations
    const topLocations = await Candidate.aggregate([
      { $match: { location: { $ne: null, $ne: '' } } },
      { $group: { _id: '$location', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    // Education distribution
    const educationStats = await Candidate.aggregate([
      { $unwind: '$education' },
      { $group: { 
        _id: '$education.degree_level', 
        count: { $sum: 1 },
        avgScore: { $avg: '$score' }
      } },
      { $sort: { count: -1 } }
    ]);
    
    res.json({
      success: true,
      data: {
        totalCandidates,
        avgExperience: avgExperience[0]?.avg || 0,
        avgScore: avgScore[0]?.avg || 0,
        topSkills,
        topLocations,
        educationStats
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Health check
app.get('/health', async (req, res) => {
  const mongoStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  const Candidate = require('./src/models/Candidate');
  const count = await Candidate.countDocuments();
  
  res.json({
    status: 'OK',
    mongodb: mongoStatus,
    candidatesCount: count,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Serve static files
app.use('/data', express.static(path.join(__dirname, '../data')));
app.use('/uploads', express.static('uploads'));

// Khởi động server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`👨‍💼 Candidates API: http://localhost:${PORT}/api/candidates`);
  console.log(`🔍 Search API: http://localhost:${PORT}/api/candidates/search?q=keyword`);
  console.log(`🥇 Top by experience: http://localhost:${PORT}/api/candidates/top/experience`);
  console.log(`🎓 Top by education: http://localhost:${PORT}/api/candidates/top/education`);
  console.log(`📈 Statistics: http://localhost:${PORT}/api/statistics`);
});