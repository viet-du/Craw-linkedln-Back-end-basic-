# 🔗 LinkedIn Candidates Crawler & Backend API - Tài Liệu Hoàn Chỉnh

**Tác giả:** Dư Quốc Việt  
**Ngôn ngữ:** Python (Scraper) + Node.js (Backend) + MongoDB + Redis  
**Cập nhật:** 15 Tháng 2, 2026  
**Phiên bản:** 1.0.0  
**Trạng thái:** Production Ready ✅

---

## 📖 Mục Lục

1. [Tổng Quan Dự Án](#-tổng-quan-dự-án)
2. [Kiến Trúc Hệ Thống](#-kiến-trúc-hệ-thống)
3. [Tính Năng Chi Tiết](#-tính-năng-chi-tiết)
4. [Tech Stack](#-tech-stack)
5. [Cài Đặt & Khởi Động](#-cài-đặt--khởi-động)
6. [Cấu Trúc Dự Án](#-cấu-trúc-dự-án)
7. [API Documentation](#-api-documentation)
8. [Database Schema](#-database-schema)
9. [Biến Môi Trường](#-biến-môi-trường)
10. [Chạy với Docker](#-chạy-với-docker)
11. [Các Module Chính](#-các-module-chính)
12. [Troubleshooting](#-troubleshooting)

---

## 🎯 Tổng Quan Dự Án

### Mục Đích
Xây dựng một hệ thống hoàn chỉnh để:
- **Thu thập dữ liệu LinkedIn** từ hồ sơ ứng viên (Python Selenium)
- **Quản lý & lưu trữ** dữ liệu tập trung (MongoDB)
- **Cung cấp API REST** cho phép tìm kiếm, lọc, xuất dữ liệu
- **Xác thực & phân quyền** người dùng qua JWT tokens
- **Đảm bảo hiệu năng** bằng Redis caching & rate limiting
- **Xác thực chất lượng** dữ liệu tự động
- **Quản lý hệ thống** cho admin

### Use Cases Chính
```
✓ HR / Recruiters     → Tìm kiếm ứng viên theo kỹ năng, kinh nghiệm
✓ Data Analysts       → Phân tích xu hướng thị trường nhân sự
✓ Admins              → Quản lý người dùng & giám sát hệ thống
✓ Developers          → Tích hợp API vào ứng dụng khác
✓ Business Teams      → Thống kê, báo cáo, dashboard
```

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
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │DataQuality   │  │Redis Cache   │  │Logger (Winston)  │  │
│  │Checker       │  │Wrapper       │  │                  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
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
    │  • Graceful shutdown                 │
    └───────────────────────────────────────┘
```

---

## 🚀 Tính Năng Chi Tiết

### 1. **Xác Thực & Phân Quyền**
- ✅ JWT Token (8 giờ expiry)
- ✅ Refresh Token (30 ngày, lưu DB)
- ✅ API Key authentication
- ✅ Token revoke/blacklist
- ✅ Role-based access (Admin, User, Viewer)
- ✅ Account locking (5 failed logins)
- ✅ Audit logging

### 2. **Crawl LinkedIn (Python)**
- ✅ Selenium WebDriver automation
- ✅ Chrome headless mode
- ✅ Login & captcha handling
- ✅ Extract: name, job, skills, experience, education
- ✅ Screenshot capture
- ✅ Threading support
- ⚠️ **Note:** Requires LinkedIn account

### 3. **Tìm Kiếm & Lọc**
- ✅ Full-text search
- ✅ Advanced filters (skills, experience, location)
- ✅ Pagination & sorting
- ✅ Aggregation & statistics
- ✅ Multiple filter combinations

### 4. **Rate Limiting**
- ✅ Redis-backed limits
- ✅ Different limits per endpoint
- ✅ Admin bypass
- ✅ IP + User ID tracking

### 5. **Chất Lượng Dữ Liệu**
- ✅ Auto-validation
- ✅ Quality scoring (0-100)
- ✅ Warnings & recommendations
- ✅ Data consistency checks

### 6. **Export Multi-Format**
- ✅ CSV
- ✅ Excel (.xlsx)
- ✅ JSON
- ✅ ZIP bundle

### 7. **Caching & Performance**
- ✅ Redis caching
- ✅ TTL-based invalidation
- ✅ Query optimization
- ✅ Pagination support

### 8. **Admin Management**
- ✅ User CRUD
- ✅ Role management
- ✅ Password reset
- ✅ API key generation
- ✅ Activity tracking

---

## 🛠️ Tech Stack

```
BACKEND:
├─ Node.js 18+
├─ Express.js (REST API)
├─ MongoDB 4.4+ (Database)
├─ Redis 6+ (Cache & Rate Limiting)
├─ JWT (Authentication)
├─ bcryptjs (Password hashing)
├─ Winston (Logging)
└─ ExcelJS, json2csv (Export)

SCRAPER:
├─ Python 3.8+
├─ Selenium (WebDriver)
├─ BeautifulSoup4 (HTML parsing)
├─ Kafka (Message queue - optional)
└─ Threading (Concurrent crawling)

INFRASTRUCTURE:
├─ Docker
├─ Docker Compose
├─ Zookeeper (Kafka coordinator)
├─ Kafka (Message broker)
└─ Nginx (Reverse proxy - optional)
```

---

## 🔧 Cài Đặt & Khởi Động

### **Option 1: Local Development (Không Docker)**

#### 1. Clone Repository
```bash
git clone https://github.com/viet-du/Craw-linkedln-Back-end-basic-.git
cd Craw-linkedln-Back-end-basic-
```

#### 2. Cài Đặt MongoDB & Redis

**Windows/macOS/Linux** (với Docker - Khuyến nghị):
```bash
docker run --name linkedin-mongodb -d -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=admin123 \
  mongo:4.4

docker run --name linkedin-redis -d -p 6379:6379 redis:7-alpine
```

#### 3. Backend Setup
```bash
cd backend
npm install
```

#### 4. Tạo `.env`
```bash
cat > .env << EOF
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
EOF
```

#### 5. Start Backend
```bash
# Development (with auto-reload)
npm run dev

# Or production
npm start
```

#### 6. Import Demo Data
```bash
npm run import
```

#### 7. Access Application
```
Frontend:  http://localhost:3000
API:       http://localhost:3000/api
```

---

### **Option 2: Docker Compose (Recommended)**

Simply run:
```bash
docker-compose up -d
```

All services start automatically:
- ✅ Zookeeper, Kafka
- ✅ MongoDB (with init script)
- ✅ Redis
- ✅ Node.js Backend

---

## 📁 Cấu Trúc Dự Án

```
linkedlin/
├── backend/                        ← NODE.JS BACKEND
│   ├── public/                     ← FRONTEND FILES
│   │   ├── index.html
│   │   ├── login.html
│   │   ├── dashboard.html
│   │   └── js/
│   │       └── chart.umd.min.js
│   ├── src/
│   │   ├── middleware/
│   │   │   ├── auth.js
│   │   │   ├── errorHandler.js
│   │   │   └── rateLimit.js
│   │   ├── models/
│   │   │   ├── Candidate.js
│   │   │   ├── User.js
│   │   │   └── RefreshToken.js
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── candidates.js
│   │   │   ├── admin.js
│   │   │   └── export.js
│   │   ├── utils/
│   │   │   ├── logger.js
│   │   │   ├── redisClient.js
│   │   │   ├── dataQuality.js
│   │   │   └── adapter.js
│   │   └── scripts/
│   │       └── importData.js
│   ├── package.json
│   └── server.js
├── scraper/                        ← PYTHON CRAWLER
│   ├── Script_craw.py
│   ├── login.txt
│   └── profiles.txt
├── Data/                           ← DATA STORAGE
│   └── backup_data/
├── docker-compose.yml
├── Dockerfile
├── mongo-init.js
└── README_COMPLETE.md
```

---

## 📡 API Documentation

### **Authentication**

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "password123"
}

Response 200:
{
  "success": true,
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "username": "admin",
      "role": "admin"
    },
    "tokens": {
      "accessToken": "eyJhbGc...",
      "refreshToken": "eyJhbGc...",
      "expiresIn": 28800
    }
  }
}
```

#### Register
```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "newuser",
  "password": "password123",
  "email": "user@example.com"
}

Response 201: User created
```

#### Refresh Token
```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGc..."
}

Response 200:
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGc..."
  }
}
```

### **Candidates**

#### Search
```http
GET /api/candidates/search?q=python
Authorization: Bearer {accessToken}

Response 200:
{
  "success": true,
  "data": [...candidates],
  "total": 120,
  "pagination": {...}
}
```

#### Advanced Filter
```http
GET /api/candidates/advanced?
  skills=Python,JavaScript&
  min_exp=3&
  max_exp=10&
  location=Ho%20Chi%20Minh
Authorization: Bearer {accessToken}

Response 200: (candidates matching filters)
```

#### Get Details
```http
GET /api/candidates/{id}
Authorization: Bearer {accessToken}

Response 200: (full candidate object)
```

#### Statistics
```http
GET /api/candidates/statistics/summary
Authorization: Bearer {accessToken}

Response 200:
{
  "success": true,
  "data": {
    "totalCandidates": 500,
    "avgExperience": 5.2,
    "avgScore": 78.5,
    "avgQuality": 85.3
  }
}
```

### **Admin**

#### Manage Users
```http
GET /api/admin/users          → List all users
POST /api/admin/users         → Create user
PUT /api/admin/users/{id}     → Update user
DELETE /api/admin/users/{id}  → Delete user

Authorization: Bearer {accessToken}
Role: admin required
```

#### Import Data
```http
POST /api/admin/upload

Form Data:
- file: candidates.json

Response 200:
{
  "success": true,
  "message": "Imported 500 candidates",
  "stats": {
    "imported": 500,
    "skipped": 10,
    "errors": 0
  }
}
```

### **Export**

```http
GET /api/export/csv?limit=1000
GET /api/export/excel?limit=1000
GET /api/export/json?limit=1000
GET /api/export/zip?format=all

Authorization: Bearer {accessToken}

Response: File download (CSV, Excel, JSON, or ZIP)
```

---

## 🗄️ Database Schema

### **Collections**

#### `candidates`
```javascript
{
  _id: ObjectId,
  name: String (required, indexed, text),
  job_title: String (required),
  location: String,
  linkedin_url: String (unique),
  skills: [String],
  experience: [{
    position: String,
    company: String,
    duration: String,
    duration_months: Number
  }],
  education: [{
    school: String,
    degree: String,
    degree_level: String
  }],
  total_experience_count: Number,
  score: Number (0-100),
  data_quality_score: Number,
  status: String,
  crawled_at: Date,
  createdAt: Date,
  updatedAt: Date
}
```

#### `users`
```javascript
{
  _id: ObjectId,
  username: String (unique),
  passwordHash: String,
  email: String (unique, sparse),
  role: String enum('admin', 'user'),
  isActive: Boolean,
  lastLogin: Date,
  loginAttempts: Number,
  lockUntil: Date,
  createdAt: Date,
  updatedAt: Date
}
```

#### `refreshtokens`
```javascript
{
  _id: ObjectId,
  token: String (unique),
  userId: ObjectId,
  userAgent: String,
  expiresAt: Date (TTL auto-delete),
  revoked: Boolean,
  createdAt: Date
}
```

---

## 🔐 Biến Môi Trường

Create `backend/.env`:

```bash
NODE_ENV=development
PORT=3000
BASE_URL=http://localhost:3000

MONGODB_URI=mongodb://admin:admin123@localhost:27017/linkedin_candidates?authSource=admin
REDIS_URL=redis://localhost:6379
REDIS_TTL=3600

JWT_SECRET=your_very_long_secret_key_min_32_chars_12345!@#$%
JWT_EXPIRES_IN=8h
REFRESH_TOKEN_EXPIRES_IN=30d

MAX_FILE_SIZE=10485760
UPLOAD_PATH=./uploads

LOG_LEVEL=debug
LOG_PATH=./logs

CORS_ORIGIN=http://localhost:3000
KAFKA_BROKERS=localhost:9092
```

---

## 🐳 Chạy với Docker

### Quick Start
```bash
docker-compose up -d
docker-compose logs -f app
docker-compose ps
```

### Stop & Cleanup
```bash
docker-compose down
docker-compose down -v  # Remove volumes
```

### Access Services
```bash
# MongoDB
docker exec -it linkedin-mongodb mongosh -u admin -p admin123 --authenticationDatabase admin

# Redis
docker exec -it linkedin-redis redis-cli

# View logs
docker-compose logs app -f
```

---

## 🔌 Các Module Chính

### 1. **Authentication** (`src/middleware/auth.js`)
- JWT token generation & verification
- Refresh token management
- API key authentication
- Token blacklist (revoke)
- Role-based access control

### 2. **Rate Limiting** (`src/middleware/rateLimit.js`)
- Redis-backed rate limiting
- Different limits per endpoint
- IP + User ID tracking
- Admin bypass

### 3. **Data Quality** (`src/utils/dataQuality.js`)
- Profile validation
- Quality scoring (0-100)
- Automatic warnings

### 4. **Caching** (`src/utils/redisClient.js`)
- Redis connectivity
- TTL-based caching
- Cache invalidation

### 5. **Logging** (`src/utils/logger.js`)
- Winston logger
- Multiple log files
- Audit trail

### 6. **Error Handler** (`src/middleware/errorHandler.js`)
- Custom error classes
- Centralized error handling
- Async error wrapper

---

## ⚠️ Troubleshooting

### MongoDB Connection Failed
```bash
docker run -d -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=admin123 \
  mongo:4.4
```

### Redis Connection Failed
```bash
docker run -d -p 6379:6379 redis:7-alpine
```

### JWT Token Expired
Use refresh token: `POST /api/auth/refresh`

### Rate Limit Exceeded
Wait for time window or use admin account.

### Port Already in Use
```bash
lsof -i :3000  # Find process
kill -9 <PID>  # Kill process
PORT=3001 npm run dev  # Use different port
```

### CORS Error
Update `.env`: `CORS_ORIGIN=http://localhost:3000`

---

## 📊 Performance Tips

- Index frequently searched fields
- Use `.lean()` for readonly queries
- Cache expensive aggregations
- Paginate results (default limit=20)
- Enable gzip compression
- Monitor database slow queries
- Setup Redis for caching

---

## 📞 Support

**Author:** Dư Quốc Việt

**GitHub:** [viet-du/Craw-linkedln-Back-end-basic-](https://github.com/viet-du/Craw-linkedln-Back-end-basic-)

**Report Issues:** Create GitHub issue with error details and reproduction steps.

---

## 📜 License

MIT License

---

**Last Updated:** February 15, 2026  
**Version:** 1.0.0  
**Status:** ✅ Production Ready
