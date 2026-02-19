# 🔗 LinkedIn Candidates Crawler & Backend API - Tài Liệu Chi Tiết Đầy Đủ

**Tác giả:** Dư Quốc Việt  
**Ngôn ngữ:** Python (Scraper) + Node.js (Backend) + MongoDB + Redis  
**Cập nhật:** 19 Tháng 2, 2026  
**Phiên bản:** 1.1.0  
**Trạng thái:** Production Ready ✅

---

## 📚 TABLE OF CONTENTS

1. [Tổng Quan Dự Án](#tổng-quan-dự-án)
2. [Kiến Trúc Hệ Thống](#kiến-trúc-hệ-thống)
3. [Tech Stack](#tech-stack)
4. [Cài Đặt & Khởi Động](#cài-đặt--khởi-động)
5. [Cấu Trúc Dự Án Chi Tiết](#cấu-trúc-dự-án-chi-tiết)
6. [Giải Thích Từng File](#giải-thích-từng-file)
7. [Database Schema Chi Tiết](#database-schema-chi-tiết)
8. [Các Lệnh Kiểm Tra Data](#các-lệnh-kiểm-tra-data)
9. [File Data & Trạng Thái](#file-data--trạng-thái)
10. [Troubleshooting](#troubleshooting)

---

## 🎯 Tổng Quan Dự Án

### Mục Đích
Xây dựng hệ thống hoàn chỉnh để:
- **Thu thập dữ liệu LinkedIn** từ hồ sơ ứng viên (Python Selenium)
- **Quản lý & lưu trữ** dữ liệu tập trung (MongoDB)
- **Cung cấp API REST** cho phép tìm kiếm, lọc, xuất dữ liệu
- **Xác thực & phân quyền** người dùng qua JWT tokens
- **Đảm bảo hiệu năng** bằng Redis caching & rate limiting
- **Xác thực chất lượng** dữ liệu tự động
- **Quản lý hệ thống** cho admin

---

## 🏗️ Kiến Trúc Hệ Thống

```
┌────────────────────────────────────────────────────────────┐
│             FRONTEND (HTML/JS/Dashboard)                   │
│          index.html, login.html, dashboard.html            │
└──────────────────────┬─────────────────────────────────────┘
                       │ HTTP/REST (port 3000)
┌──────────────────────▼─────────────────────────────────────┐
│              EXPRESS BACKEND (Node.js)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │Auth Routes   │  │Candidate     │  │Admin Routes      │  │
│  │-Login/Logout │  │Routes        │  │-User Mgmt        │  │
│  │-Register     │  │-Search       │  │-Audit Log        │  │
│  │-Refresh Token│  │-Advanced     │  │-Data Import      │  │
│  │-API Key      │  │Filter        │  │-Validation       │  │
│  └──────────────┘  │-Statistics   │  └──────────────────┘  │
│                    └──────────────┘  ┌──────────────────┐  │
│                                      │Export Routes     │  │
│                                      │-CSV, Excel, JSON │  │
│                                      │-ZIP Archive      │  │
│                                      └──────────────────┘  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │     MIDDLEWARE (Auth, RateLimit, Error Handler)    │   │
│  └─────────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────┬──────────────────┘
                       │                  │
          MongoDB (27017)        Redis (6379)
          - candidates           - Cache
          - users                - Rate Limits
          - refreshtokens        - Sessions
                       │
    ┌──────────────────┴────────────────────┐
    │    Python Selenium Scraper            │
    │    (scraper/Script_craw.py)           │
    │                                       │
    │  • Chrome WebDriver automation        │
    │  • LinkedIn login handling            │
    │  • Profile data extraction            │
    │  • Multi-threading support           │
    │  • Kafka producer integration        │
    └───────────────────────────────────────┘
```

---

## 🛠️ Tech Stack

```
BACKEND:
├─ Node.js 18+ (JavaScript runtime)
├─ Express.js (REST API framework)
├─ MongoDB 4.4+ (NoSQL Database)
├─ Redis 6+ (Cache & Rate Limiting)
├─ JWT (JSON Web Tokens)
├─ bcryptjs (Password hashing)
├─ Winston (Logging)
├─ Mongoose (ODM)
├─ Helmet (Security)
├─ Multer (File upload)
├─ ExcelJS (Excel export)
└─ json2csv (CSV export)

SCRAPER:
├─ Python 3.8+
├─ Selenium (WebDriver)
├─ BeautifulSoup4 (HTML parsing)
├─ Kafka (Message queue)
└─ Threading (Multi-threading)

INFRASTRUCTURE:
├─ Docker & Docker Compose
├─ Zookeeper (Kafka coordinator)
├─ Kafka 7.3 (Message broker)
└─ MongoDB 4.4 & Redis 7
```

---

## 🔧 Cài Đặt & Khởi Động

### **Option 1: Docker Compose (Khuyến Nghị)**

```bash
# Clone repository
git clone https://github.com/viet-du/Craw-linkedln-Back-end-basic-.git
cd Craw-linkedln-Back-end-basic-

# Khởi động tất cả services
docker-compose up -d

# Xem logs
docker-compose logs -f app

# Dừng toàn bộ
docker-compose down
```

**Services sẽ start:**
- MongoDB (27017)
- Redis (6379)
- Zookeeper (2181)
- Kafka (9092)
- Node.js Backend (3000)

### **Option 2: Local Development**

#### Step 1: Khởi động MongoDB & Redis
```bash
# MongoDB
docker run --name linkedin-mongodb -d -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=admin123 \
  mongo:4.4

# Redis
docker run --name linkedin-redis -d -p 6379:6379 redis:7-alpine
```

#### Step 2: Setup Backend
```bash
cd backend
npm install
```

#### Step 3: Tạo `.env`
```bash
NODE_ENV=development
PORT=3000
BASE_URL=http://localhost:3000
MONGODB_URI=mongodb://admin:admin123@localhost:27017/linkedin_candidates?authSource=admin
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_super_secret_jwt_key_min_32_chars_12345!@#$%
JWT_EXPIRES_IN=8h
REFRESH_TOKEN_EXPIRES_IN=30d
MAX_FILE_SIZE=10485760
UPLOAD_PATH=./uploads
LOG_LEVEL=debug
CORS_ORIGIN=http://localhost:3000
```

#### Step 4: Start Backend
```bash
npm run dev     # Development với auto-reload
npm start       # Production
npm run import  # Import demo data
```

#### Step 5: Access
```
Frontend:  http://localhost:3000
API:       http://localhost:3000/api
Health:    http://localhost:3000/health
API Docs:  http://localhost:3000/api-docs
```

---

## 📁 Cấu Trúc Dự Án Chi Tiết

```
linkedlin/
│
├── docker-compose.yml              ← Khởi động tất cả services
├── Dockerfile                      ← Build image Node.js
├── mongo-init.js                   ← MongoDB init script (indexes, collections)
│
├── backend/
│   ├── public/                     ← Frontend static files
│   │   ├── index.html              ← Trang chủ
│   │   ├── login.html              ← Đăng nhập
│   │   ├── dashboard.html          ← Dashboard chính
│   │   ├── admin.html              ← Quản lý user
│   │   ├── authInterceptor.js      ← JWT HTTP interceptor
│   │   └── js/
│   │       └── chart.umd.min.js    ← Chart.js library
│   │
│   ├── src/
│   │   ├── models/                 ← Mongoose Schemas
│   │   │   ├── Candidate.js        ← Ứng viên: name, job, skills, exp, edu
│   │   │   ├── User.js             ← Người dùng: username, role, password
│   │   │   └── RefreshToken.js     ← Refresh token: userId, expiresAt
│   │   │
│   │   ├── routes/                 ← API Routes
│   │   │   ├── auth.js             ← Login, Register, Refresh, Logout
│   │   │   ├── candidates.js       ← Search, Advanced Filter, Stats
│   │   │   ├── admin.js            ← User Management, Import Data
│   │   │   └── export.js           ← CSV, Excel, JSON, ZIP Export
│   │   │
│   │   ├── middleware/
│   │   │   ├── auth.js             ← JWT & API Key verification
│   │   │   ├── rateLimit.js        ← Rate limiting per endpoint
│   │   │   └── errorHandler.js     ← Global error handling
│   │   │
│   │   ├── utils/
│   │   │   ├── logger.js           ← Winston logger (error, combined, audit)
│   │   │   ├── redisClient.js      ← Redis wrapper (get, set, cache)
│   │   │   ├── dataQuality.js      ← Validate & score data
│   │   │   └── adapter.js          ← Data transformation
│   │   │
│   │   └── scripts/
│   │       └── importData.js       ← Import candidates từ JSON
│   │
│   ├── server.js                   ← Express app entry
│   ├── server_local.js             ← Local dev config
│   ├── package.json                ← Dependencies
│   ├── logs/                       ← Log directory
│   └── uploads/                    ← Uploaded files
│
├── scraper/                        ← Python Selenium Crawler
│   ├── Script_craw.py              ← Main crawler
│   ├── kafka_consumer.py           ← Kafka consumer
│   ├── login.txt                   ← LinkedIn credentials
│   ├── profiles.txt                ← Profile URLs (một URL/dòng)
│   └── test-kafka.py               ← Test Kafka
│
├── Data/
│   ├── output.json                 ← Crawled data
│   ├── crawl_meta.json             ← Metadata (last_crawled, checksum)
│   └── backup_data/                ← Backups
│
└── logs/                           ← Application logs
    ├── error.log                   ← Errors
    ├── combined.log                ← All logs
    ├── audit.log                   ← Audit trail
    └── http.log                    ← HTTP requests
```

---

## 📚 Giải Thích Từng File

### **Models** (`backend/src/models/`)

#### **Candidate.js**
```javascript
{
  // Basic Info
  name: String,                              // Tên ứng viên (text indexed)
  location: String,                          // Vị trí (ví dụ: Ho Chi Minh City)
  job_title: String,                         // Chức vụ hiện tại (text indexed)
  
  // URLs
  linkedin_url: String (unique),             // https://linkedin.com/in/...
  normalized_url: String (unique),           // Chuẩn hóa URL
  
  // Experience & Skills
  total_experience_count: Number,            // Tổng số năm
  experience: [{
    position: String,                        // Ví dụ: "Software Engineer"
    company: String,                         // Ví dụ: "Google"
    employment_type: String,                 // Full-time, Part-time, etc.
    duration: String,                        // "Sep 2023 - Jan 2024"
    duration_months: Number                  // 4
  }],
  
  skills: [String],                          // ["Python", "JavaScript", ...]
  
  // Education
  education: [{
    school: String,                          // Ví dụ: "Harvard University"
    degree: String,                          // "Bachelor of Science"
    degree_level: String,                    // Bachelor, Master, PhD, etc.
    duration: String                         // "2020 - 2024"
  }],
  
  // Scoring
  score: Number (0-100),                     // Điểm đánh giá
  data_quality_score: Number (0-100),        // Điểm chất lượng dữ liệu
  status: String enum('active', 'inactive', 'flagged'),
  
  // Timestamps
  crawled_at: Date,                          // Crawl time
  updated_at: Date,                          // Last update
  createdAt: Date, updatedAt: Date
}
```

**Quality Score (tính tự động):**
- name + job_title: 40 points
- experience: 25 points
- education: 15 points
- skills: 10 points
- linkedin_url: 10 points

---

#### **User.js**
```javascript
{
  username: String (unique),                 // 3-30 chars, alphanumeric + _
  passwordHash: String,                      // bcrypt hashed password
  email: String (unique, optional),
  role: String enum('user', 'admin'),        // Phân quyền
  
  // Account Security
  isActive: Boolean,                         // Tài khoản hoạt động?
  lastLogin: Date,                           // Lần login gần nhất
  loginAttempts: Number,                     // Failed login counter
  lockUntil: Date,                           // Lock account until this date
  
  // API Access
  apiKey: String (unique),                   // Auto-generated for admin
  
  // Preferences
  preferences: {
    theme: String enum('light', 'dark', 'auto'),
    itemsPerPage: Number (default: 20)
  },
  
  createdAt: Date, updatedAt: Date
}
```

**Login Lock Logic:**
- 5 failed logins → lock 2 hours
- Successful login → reset counter

---

#### **RefreshToken.js**
```javascript
{
  token: String (unique),                    // JWT token (hashed)
  userId: ObjectId (indexed),                // Reference to User
  expiresAt: Date,                           // 7 ngày từ lúc create
  revoked: Boolean,                          // Bị thu hồi?
  replacedByToken: String,                   // Token thay thế (khi rotate)
  deviceInfo: String,                        // User-Agent (tracking device)
  createdAt: Date
}
```

**TTL Index:** MongoDB tự động xoá khi `expiresAt` hết hạn

---

### **Routes** (`backend/src/routes/`)

#### **auth.js - Authentication**

```javascript
POST /api/auth/login
{
  "username": "admin",
  "password": "password123"
}
Response:
{
  "success": true,
  "data": {
    "user": { "id": "...", "username": "admin", "role": "admin" },
    "tokens": {
      "accessToken": "eyJhbGc...",      // 8 hours
      "refreshToken": "eyJhbGc...",     // 7 days
      "expiresIn": 28800
    }
  }
}

POST /api/auth/register
{
  "username": "newuser",
  "password": "password123",
  "email": "user@example.com"
}

POST /api/auth/refresh
{
  "refreshToken": "eyJhbGc..."
}
Response: { "accessToken": "..." }

POST /api/auth/logout
{
  "refreshToken": "eyJhbGc..."
}

GET /api/auth/me
Headers: Authorization: Bearer {token}
Response: { "success": true, "data": {...user} }
```

#### **candidates.js - Data Management**

```javascript
GET /api/candidates/statistics/summary
Response:
{
  "success": true,
  "data": {
    "totalCandidates": 500,
    "avgExperience": 5.2,
    "avgScore": 78.5,
    "avgQuality": 85.3
  }
}

GET /api/candidates/statistics/distributions?type=skills&limit=10
Response:
{
  "success": true,
  "data": [
    { "label": "Python", "count": 150, "percentage": 30 },
    { "label": "JavaScript", "count": 120, "percentage": 24 },
    ...
  ]
}

GET /api/candidates/search?q=python&page=1&limit=20
Response:
{
  "success": true,
  "data": [{...candidates}, ...],
  "pagination": { "page": 1, "total": 150, "pages": 8, ... }
}

GET /api/candidates/advanced-search
?q=senior&minExperience=5&maxExperience=10
&skills=Python,JavaScript&location=Ho%20Chi%20Minh
Response: { "success": true, "data": [...], "pagination": {...} }

GET /api/candidates/:id
Response: { "success": true, "data": {...full candidate} }

POST /api/candidates
Body: { candidate object }
Response: { "success": true, "data": {...created candidate} }
```

#### **admin.js - Admin Management**

```javascript
GET /api/admin/users
Response:
{
  "success": true,
  "data": [
    {
      "id": "...",
      "username": "admin",
      "email": "admin@example.com",
      "role": "admin",
      "isActive": true,
      "lastLogin": "2026-02-19T10:30:00Z",
      "createdAt": "2026-01-01T00:00:00Z"
    },
    ...
  ]
}

POST /api/admin/users
Body:
{
  "username": "newuser",
  "password": "password123",
  "email": "newuser@example.com",
  "role": "user"
}

PUT /api/admin/users/{id}
Body:
{
  "email": "newemail@example.com",
  "role": "admin",
  "isActive": true
}

DELETE /api/admin/users/{id}
Response: { "success": true, "message": "User deleted" }

POST /api/admin/import
(multipart/form-data with JSON file)
Response:
{
  "success": true,
  "message": "Imported 500 candidates",
  "stats": {
    "total": 500,
    "imported": 500,
    "updated": 0,
    "skipped": 0,
    "errors": 0
  }
}
```

#### **export.js - Data Export**

```javascript
GET /api/export/csv?limit=1000
Response: CSV file download

GET /api/export/excel?limit=1000
Response: Excel file download

GET /api/export/json?limit=1000
Response: JSON file download

GET /api/export/zip?format=all
Response: ZIP file (chứa CSV, Excel, JSON)
```

---

## 📊 Database Schema Chi Tiết

### MongoDB Collections

#### **candidates** Collection
```javascript
db.candidates.find().select({
  _id: 1,
  name: 1,
  job_title: 1,
  location: 1,
  skills: 1,
  score: 1,
  data_quality_score: 1
})

// Indexes
db.candidates.getIndexes()
// Result:
[
  { key: { _id: 1 } },                          // Default
  { key: { name: 1 } },
  { key: { job_title: 1 } },
  { key: { linkedin_url: 1 }, unique: true },
  { key: { normalized_url: 1 }, unique: true },
  { key: { score: -1 } },
  { key: { total_experience_count: -1 } },
  { key: { location: 1 } },
  { key: { skills: 1 } },
  { key: { 'education.degree_level': 1 } },
  { key: { status: 1 } },
  { 
    key: { name: 'text', job_title: 'text', ... },  // Text search index
    weights: { name: 10, job_title: 5, ... }
  }
]
```

#### **users** Collection
```javascript
db.users.findOne({ username: "admin" })
// Result:
{
  _id: ObjectId("507f1f77bcf86cd799439011"),
  username: "admin",
  passwordHash: "$2a$12$...",
  role: "admin",
  email: "admin@example.com",
  isActive: true,
  lastLogin: ISODate("2026-02-19T10:30:00Z"),
  loginAttempts: 0,
  lockUntil: null,
  apiKey: "abc123def456...",
  preferences: {
    theme: "light",
    itemsPerPage: 20
  },
  createdAt: ISODate("2026-01-01T00:00:00Z"),
  updatedAt: ISODate("2026-02-19T10:30:00Z")
}
```

#### **refreshtokens** Collection
```javascript
db.refreshtokens.findOne({ userId: ObjectId("...") })
// Result:
{
  _id: ObjectId("..."),
  token: "e3b0c44298fc1c14...",     // Hash of JWT
  userId: ObjectId("507f1f77bcf86cd799439011"),
  expiresAt: ISODate("2026-02-26T00:00:00Z"),     // 7 days
  revoked: false,
  replacedByToken: null,
  deviceInfo: "Mozilla/5.0...",
  createdAt: ISODate("2026-02-19T00:00:00Z")
}
```

---

## 🔍 Các Lệnh Kiểm Tra Data

### MongoDB Commands

```bash
# Kết nối MongoDB
mongosh -u admin -p admin123 --authenticationDatabase admin

# Chọn database
use linkedin_candidates

# Kiểm tra tập hợp
show collections                                    # Liệt kê collections
db.candidates.countDocuments()                      # Tổng số candidates
db.users.countDocuments()                           # Tổng số users

# Xem dữ liệu
db.candidates.findOne()                             # Xem 1 candidate
db.candidates.find().limit(5).pretty()              # Top 5
db.users.find().pretty()                            # All users
db.refreshtokens.find().limit(3).pretty()           # Refresh tokens

# Statistics
db.candidates.aggregate([
  { $group: {
      _id: null,
      count: { $sum: 1 },
      avgScore: { $avg: '$score' },
      avgQuality: { $avg: '$data_quality_score' },
      minExp: { $min: '$total_experience_count' },
      maxExp: { $max: '$total_experience_count' }
    }
  }
])

# Tìm kiếm
db.candidates.find({ job_title: /engineer/i })      # Regex search
db.candidates.find({ skills: "Python" })            # By skill
db.candidates.find({ location: "Ho Chi Minh" })     # By location

# Cập nhật
db.candidates.updateOne(
  { _id: ObjectId("...") },
  { $set: { status: "active" } }
)

# Xoá
db.candidates.deleteOne({ _id: ObjectId("...") })
```

### Redis Commands

```bash
# Kết nối Redis
redis-cli

# Kiểm tra toàn bộ
INFO                                                # Server info
DBSIZE                                              # Tổng số key

# Cache operations
GET candidates:page:1                               # Get cache key
DEL candidates:page:1                               # Delete cache key
KEYS "candidates:*"                                 # Find all cache keys

# Rate limiting
GET rate_limit:user_id:search                       # Check rate limit
INCR rate_limit:user_id:search                      # Increment counter

# Session tracking
GET blacklist:token_jwt_here                        # Check token blacklist
TTL blacklist:token_jwt_here                        # Time to live

# Utility
FLUSHALL                                            # Clear all (⚠️)
CONFIG GET maxmemory                                # Memory settings
```

### API Endpoints for Testing

```bash
# Health check
curl http://localhost:3000/health

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password123"}'

# Search candidates
curl -H "Authorization: Bearer {token}" \
  "http://localhost:3000/api/candidates/search?q=python"

# Export data
curl -H "Authorization: Bearer {token}" \
  "http://localhost:3000/api/export/csv" > candidates.csv

# Admin info
curl -H "Authorization: Bearer {token}" \
  http://localhost:3000/api/admin/users
```

---

## 📁 File Data & Trạng Thái

### **Data/output.json** - Dữ Liệu Crawl
```json
[
  {
    "name": "Luong Thanh",
    "location": "Ho Chi Minh City, Vietnam",
    "job_title": "Software Engineer | DevOps",
    "education": [
      {
        "school": "VNUHCM - University of Science",
        "degree": "Bachelor's degree, Data Science",
        "duration": "Aug 2022 - Jul 2026"
      }
    ],
    "experience": [
      {
        "position": "System Engineer",
        "company": "Zalo",
        "employment_type": "Full-time",
        "duration": "Sep 2025 - Present"
      }
    ],
    "total_experience_count": 3,
    "url": "https://www.linkedin.com/in/luongthanh/"
  },
  ...
]
```

**Trạng thái dữ liệu:**
- `active` - Ứng viên đang hoạt động (mặc định)
- `inactive` - Không còn hoạy động
- `flagged` - Dữ liệu đáng ngờ

### **Data/crawl_meta.json** - Metadata Crawl
```json
{
  "https://www.linkedin.com/in/luongthanh/": {
    "last_crawled": "2026-02-19T22:05:46.344312",
    "checksum": "8ca2098381a2ec8b955150a631e79afade320dcaf38e825a332cd3af78145b42"
  },
  "https://www.linkedin.com/in/nguyen-ho-thien-thanh/": {
    "last_crawled": "2026-02-19T22:05:48.360992",
    "checksum": "8ca2098381a2ec8b955150a631e79afade320dcaf38e825a332cd3af78145b42"
  }
}
```

**Thông tin:**
- `last_crawled` - Lần crawl gần nhất
- `checksum` - Để detect changes (unchanged = same hash)

### **Logs/** - Application Logs

```
logs/
├── error.log         ← Chi có errors (level: error)
│   [2026-02-19 10:30:00] ERROR: MongoDB connection failed
│   [2026-02-19 10:31:00] ERROR: ValidationError: Name required
│
├── combined.log      ← Tất cả logs (info, warn, error, etc.)
│   [2026-02-19 10:00:00] INFO: Server started on port 3000
│   [2026-02-19 10:01:00] WARN: Redis not available
│   [2026-02-19 10:30:00] ERROR: Database error
│
├── audit.log         ← Security events
│   { "level": "audit", "message": "Login", "userId": "507f...", "ip": "192.168.1.1", "timestamp": "2026-02-19T10:00:00Z" }
│   { "level": "audit", "message": "User created", "adminId": "507f...", "newUserId": "...", "timestamp": "..." }
│   { "level": "audit", "message": "CSV export", "userId": "507f...", "count": 500, "timestamp": "..." }
│
└── http.log          ← HTTP requests
    { "method": "GET", "url": "/api/candidates/search", "statusCode": 200, "duration": 45, "userId": "507f..." }
    { "method": "POST", "url": "/api/auth/login", "statusCode": 200, "duration": 120 }
```

### **Rating & Quality Scores**

#### **score** (0-100) - Điểm Ứng Viên
```
Phụ thuộc vào:
- Experience (max 40): years * 4
- Education (max 30): dựa trên degree level
  - PhD: 30
  - Master/MBA: 25
  - Bachelor: 15
  - High School: 5
- Experience entries (max 20): số lần * 2
- Skills (max 10): thấp nhất là 0, max là 10

Ví dụ:
- 5 years exp (20) + Bachelor (15) + 2 jobs (4) + 5 skills (2.5) = ~42/100
- 10 years exp (40) + Master (25) + 5 jobs (10) + 15 skills (10) = ~85/100
```

#### **data_quality_score** (0-100) - Điểm Chất Lượng Dữ Liệu
```
Tính toán:
- name + job_title (present): 40%
- linkedin_url (present): 10%
- experience (count * 5, max 25%): 0-25%
- education (count * 5, max 15%): 0-15%
- skills (count * 2, max 10%): 0-10%

Ví dụ:
- Chỉ có name + job_title: 40%
- + LinkedIn URL: 50%
- + 1 experience: 55%
- + 1 education: 60%
- + 3 skills: 66%
```

---

## ⚠️ Troubleshooting

### **MongoDB Connection Failed**

```bash
# Check if MongoDB is running
docker ps | grep mongodb

# If not running
docker run -d --name linkedin-mongodb \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=admin123 \
  -p 27017:27017 \
  mongo:4.4

# Test connection
mongosh -u admin -p admin123 --authenticationDatabase admin
```

### **Redis Connection Failed**

```bash
# Check Redis
docker ps | grep redis

# If not running
docker run -d --name linkedin-redis -p 6379:6379 redis:7-alpine

# Test
redis-cli ping
# Should return: PONG
```

### **Rate Limit Exceeded**

```bash
# Clear rate limits in Redis
redis-cli
KEYS "rate_limit:*"
DEL rate_limit:user_id:endpoint

# Or login with admin (no rate limit)
```

### **JWT Token Expired**

```bash
# Use refresh endpoint
POST /api/auth/refresh
{
  "refreshToken": "your_refresh_token"
}

# Get new access token
```

### **Port Already in Use**

```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>

# Or use different port
PORT=3001 npm run dev
```

### **Data Quality Validation Fails**

```bash
# Check error logs
tail -f logs/error.log

# Validate individual profile
curl -X POST http://localhost:3000/api/candidates/validate \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "job_title": "Engineer",
    "linkedin_url": "https://linkedin.com/in/john-doe",
    ...
  }'
```

---

## 📊 Performance Tips

- **Index:** Tạo index cho fields được tìm kiếm thường xuyên
- **Caching:** Redis cache frequently accessed data
- **Lean Queries:** Dùng `.lean()` cho read-only queries
- **Pagination:** Luôn paginate kết quả (default 20/page)
- **Rate Limiting:** Bảo vệ API khỏi abuse
- **Gzip:** Enable compression (Helmet)
- **Monitoring:** Theo dõi slow queries, memory usage

---

## 🔐 Security Notes

- ✅ Password hashed với bcryptjs (12 rounds)
- ✅ JWT tokens signed với secret key
- ✅ Refresh tokens hashed trong DB
- ✅ Rate limiting (IP + User ID)
- ✅ CORS enabled (configurable)
- ✅ Helmet security headers
- ✅ MongoDB sanitization
- ✅ Audit logging tất cả sensitive actions
- ✅ Account locking sau failed logins
- ✅ Token blacklist (Redis)

---

## 📞 Support & Feedback

**Author:** Dư Quốc Việt  
**GitHub:** [viet-du/Craw-linkedln-Back-end-basic-](https://github.com/viet-du/Craw-linkedln-Back-end-basic-)

---

**Last Updated:** February 19, 2026  
**Version:** 1.1.0  
**Status:** ✅ Production Ready
