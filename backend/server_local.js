require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const adapter = require('./src/utils/adapter');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('./src/models/User');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const mongoUri = process.env.MONGODB_URI;
let usingMongo = false;

async function tryLoadFileFallback() {
  const candidatesPaths = [
    path.resolve(__dirname, '..', 'Data', 'output.json'),
    path.resolve(__dirname, '..', 'data', 'output.json'),
    path.resolve(__dirname, '..', 'Data', 'output_temp.json'),
    path.resolve(__dirname, '..', 'Data', '1.json')
  ];
  for (const p of candidatesPaths) {
    const ok = await adapter.loadFromFile(p);
    if (ok) return true;
  }
  console.warn('⚠️ No fallback data file found. APIs will return empty sets.');
  return false;
}

async function initMongoose() {
  if (mongoUri) {
    try {
      await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
      console.log('✅ Connected to MongoDB');
      const Candidate = require('./src/models/Candidate');
      adapter.setMongooseModel(Candidate);
      usingMongo = true;
      const count = await adapter.countDocuments();
      console.log(`📊 Candidates in DB: ${count}`);
      return true;
    } catch (err) {
      console.warn('❌ MongoDB error:', err.message);
      return false;
    }
  }
  return false;
}

// Routes
app.get('/api/candidates', authenticateJWT, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const candidates = await adapter.findCandidates({}, { sort: { score: -1 }, skip, limit });
    const total = await adapter.countDocuments({});
    res.json({ success: true, data: candidates, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- Authentication helpers ---
function authenticateJWT(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ success: false, error: 'Missing token' });
  const token = auth.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
    req.user = payload;
    return next();
  } catch (e) {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, error: 'Not authenticated' });
    if (req.user.role !== role && req.user.role !== 'admin') return res.status(403).json({ success: false, error: 'Forbidden' });
    next();
  };
}

// Auth routes
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ success: false, error: 'username and password required' });
  try {
    const user = await User.findOne({ username }).exec();
    if (!user) return res.status(401).json({ success: false, error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ success: false, error: 'Invalid credentials' });
    const token = jwt.sign({ id: user._id, username: user.username, role: user.role }, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '8h' });
    res.json({ success: true, token, user: { username: user.username, role: user.role } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Register user (admin only)
app.post('/api/admin/users', authenticateJWT, requireRole('admin'), async (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password) return res.status(400).json({ success: false, error: 'username and password required' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const u = new User({ username, passwordHash: hash, role: role || 'user' });
    await u.save();
    res.json({ success: true, user: { username: u.username, role: u.role } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/admin/users', authenticateJWT, requireRole('admin'), async (req, res) => {
  try {
    const users = await User.find({}, 'username role createdAt').lean();
    res.json({ success: true, users });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.delete('/api/admin/users/:id', authenticateJWT, requireRole('admin'), async (req, res) => {
  try {
    await User.deleteOne({ _id: req.params.id });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Protect candidate endpoints: require auth
app.use('/api/candidates', authenticateJWT);
app.use('/api/statistics', authenticateJWT);

app.get('/api/candidates/search', authenticateJWT, async (req, res) => {
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
    const candidates = await adapter.findCandidates(searchQuery, { sort: { score: -1 }, skip, limit });
    const total = await adapter.countDocuments(searchQuery);
    res.json({ success: true, data: candidates, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/candidates/top/experience', authenticateJWT, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const candidates = await adapter.getTopByExperience(limit);
    res.json({ success: true, data: candidates });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/candidates/top/education', authenticateJWT, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const candidates = await adapter.getTopByEducation(limit);
    res.json({ success: true, data: candidates });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/statistics', authenticateJWT, async (req, res) => {
  try {
    const stats = await adapter.getStatistics();
    if (stats) {
      return res.json({ success: true, data: stats });
    }
    if (usingMongo) {
      const Candidate = require('./src/models/Candidate');
      const totalCandidates = await Candidate.countDocuments();
      const avgExperience = await Candidate.aggregate([{ $group: { _id: null, avg: { $avg: '$total_experience_count' } } }]);
      const avgScore = await Candidate.aggregate([{ $group: { _id: null, avg: { $avg: '$score' } } }]);
      const topSkills = await Candidate.aggregate([{ $unwind: '$skills' }, { $group: { _id: '$skills', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 10 }]);
      const topLocations = await Candidate.aggregate([{ $match: { location: { $ne: null, $ne: '' } } }, { $group: { _id: '$location', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 10 }]);
      const educationStats = await Candidate.aggregate([{ $unwind: '$education' }, { $group: { _id: '$education.degree_level', count: { $sum: 1 } } }, { $sort: { count: -1 } }]);
      return res.json({ success: true, data: { totalCandidates, avgExperience: avgExperience[0]?.avg || 0, avgScore: avgScore[0]?.avg || 0, topSkills, topLocations, educationStats } });
    }
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/health', async (req, res) => {
  try {
    const mongoStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    const count = await adapter.countDocuments();
    res.json({ status: 'OK', mongodb: mongoStatus, candidatesCount: count, uptime: process.uptime(), timestamp: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ status: 'ERROR', error: e.message });
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

async function main() {
  const mongoLoaded = await initMongoose();
  if (!mongoLoaded) {
    await tryLoadFileFallback();
  }

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`🌐 UI: http://localhost:${PORT}/`);
    console.log(`📊 Health: http://localhost:${PORT}/health`);
  });
}

main().catch(err => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});
