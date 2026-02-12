// MongoDB initialization script – LinkedIn Candidates
db = db.getSiblingDB('linkedin_candidates');

// ========== 1. Tạo collections ==========
db.createCollection('candidates');
db.createCollection('users');
db.createCollection('refreshtokens');   // ✅ THÊM COLLECTION REFRESH TOKEN

// ========== 2. Index cho candidates ==========
db.candidates.createIndex({ name: 1 });
db.candidates.createIndex({ job_title: 1 });
db.candidates.createIndex({ linkedin_url: 1 }, { unique: true, sparse: true });
db.candidates.createIndex({ normalized_url: 1 }, { unique: true, sparse: true });
db.candidates.createIndex({ score: -1 });
db.candidates.createIndex({ total_experience_count: -1 });
db.candidates.createIndex({ location: 1 });
db.candidates.createIndex({ skills: 1 });
db.candidates.createIndex({ 'education.degree_level': 1 });
db.candidates.createIndex({ status: 1 });

// Text index cho tìm kiếm full-text
db.candidates.createIndex(
  { name: 'text', job_title: 'text', location: 'text', skills: 'text' },
  { weights: { name: 10, job_title: 5, location: 3, skills: 2 } }
);

// ========== 3. Index cho users ==========
db.users.createIndex({ username: 1 }, { unique: true });
db.users.createIndex({ email: 1 }, { unique: true, sparse: true });
db.users.createIndex({ role: 1 });
db.users.createIndex({ isActive: 1 });
db.users.createIndex({ apiKey: 1 }, { unique: true, sparse: true });

// ========== 4. Index cho refreshtokens ==========
db.refreshtokens.createIndex({ token: 1 }, { unique: true });        // tra cứu nhanh
db.refreshtokens.createIndex({ userId: 1 });                         // lọc theo user
db.refreshtokens.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // tự động xoá khi hết hạn
db.refreshtokens.createIndex({ userId: 1, revoked: 1 });            // query token còn sống

print('✅ MongoDB initialized successfully – 3 collections ready!');