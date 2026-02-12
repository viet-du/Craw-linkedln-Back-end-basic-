# 🔗 LinkedIn Candidates Crawler & Backend API

**Tác giả:** Dư Quốc Việt

Hệ thống backend toàn diện để crawl, quản lý và tìm kiếm thông tin hồ sơ ứng viên LinkedIn với các tính năng như xác thực JWT, lưu trữ Redis, giới hạn tỷ lệ, xác thực chất lượng dữ liệu và xuất dữ liệu.

---

## 📋 Mục Lục

1. [Tổng Quan](#tổng-quan)
2. [Tính Năng](#tính-năng)
3. [Yêu Cầu](#yêu-cầu)
4. [Cài Đặt](#cài-đặt)
5. [Cấu Trúc Dự Án](#cấu-trúc-dự-án)
6. [Giải Thích Các File](#giải-thích-các-file)
7. [Cách Hoạt Động Các Module](#cách-hoạt-động-các-module)
8. [Xử Lý Lỗi](#xử-lý-lỗi)
9. [Các Endpoint API](#các-endpoint-api)
10. [Lệnh Chạy](#lệnh-chạy)
11. [Biến Môi Trường](#biến-môi-trường)
12. [Đoạn Code Quan Trọng](#đoạn-code-quan-trọng)

---

## 🎯 Tổng Quan

Dự án này là một backend API cho phép:
- **Crawl dữ liệu LinkedIn** từ hồ sơ ứng viên
- **Xác thực & phân quyền** người dùng qua JWT tokens
- **Tìm kiếm nâng cao** với các bộ lọc theo kỹ năng, kinh nghiệm, học vấn
- **Xác thực chất lượng dữ liệu** tự động cho mỗi hồ sơ
- **Lưu trữ & caching** dữ liệu với Redis để cải thiện hiệu năng
- **Xuất dữ liệu** sang CSV, Excel, JSON
- **Quản trị viên** quản lý người dùng và hệ thống

---

## 🚀 Tính Năng

| Tính Năng | Mô Tả |
|-----------|-------|
| **Crawl LinkedIn** | Tự động thu thập hồ sơ LinkedIn với Selenium |
| **Xác Thực JWT** | Token tự động hết hạn sau 8 giờ, refresh token lâu dài |
| **Rate Limiting** | Giới hạn yêu cầu dựa trên Redis + IP/User ID |
| **Tìm Kiếm** | Tìm kiếm cơ bản & nâng cao với bộ lọc đa chiều |
| **Chất Lượng Dữ Liệu** | Kiểm tra tự động, cảnh báo & điểm số |
| **Caching** | Redis lưu trữ kết quả tìm kiếm, thống kê |
| **Quản Lý User** | Tạo, cập nhật, xóa, khóa tài khoản người dùng |
| **Audit Log** | Ghi lại tất cả hành động quản trị |
| **Export** | CSV, Excel, JSON, ZIP với dữ liệu được lọc |
| **Dashboard** | Thống kê tổng hợp: tổng ứng viên, điểm trung bình, v.v. |

---

## 📌 Yêu Cầu

```
Node.js:    18.0.0 hoặc cao hơn
npm:        9.0.0 hoặc cao hơn
MongoDB:    4.4 hoặc cao hơn
Redis:      6.0 hoặc cao hơn (tuỳ chọn, nhưng khuyến nghị)
Python:     3.8+ (cho script crawl)
Docker:     (tuỳ chọn, để chạy với Docker Compose)
```

---

## 🔧 Cài Đặt

### **Option 1: Cài Đặt Trực Tiếp (Local)**

#### 1. Clone và cài đặt dependencies
```bash
git clone <repository-url>
cd linkedin-back

# Cài đặt dependencies backend
cd backend
npm install
```

#### 2. Tạo file `.env` trong thư mục `backend/`
```bash
# Server
NODE_ENV=development
PORT=3000
BASE_URL=http://localhost:3000

# Database
MONGODB_URI=mongodb://admin:admin123@localhost:27017/linkedin_candidates?authSource=admin
MONGODB_USER=admin
MONGODB_PASSWORD=admin123

# Redis
REDIS_URL=redis://localhost:6379
REDIS_TTL=3600

# JWT
JWT_SECRET=your_super_secret_key_change_in_production_12345
JWT_EXPIRES_IN=8h
REFRESH_TOKEN_EXPIRES_IN=30d

# Upload
MAX_FILE_SIZE=10485760
UPLOAD_PATH=./uploads

# Logging
LOG_LEVEL=debug

# CORS
CORS_ORIGIN=http://localhost:3000
```

#### 3. Khởi động MongoDB & Redis
```bash
# Nếu sử dụng Docker
docker run -d -p 27017:27017 -e MONGO_INITDB_ROOT_USERNAME=admin -e MONGO_INITDB_ROOT_PASSWORD=admin123 mongo:4.4
docker run -d -p 6379:6379 redis:7-alpine
```

#### 4. Chạy server
```bash
# Development
npm run dev

# Production
npm start
```

### **Option 2: Cài Đặt với Docker Compose**

```bash
# Từ thư mục gốc
docker-compose up -d

# Kiểm tra logs
docker-compose logs -f app
```

---

## 📁 Cấu Trúc Dự Án

```
linkedlin/
├── backend/
│   ├── src/
│   │   ├── middleware/          # Các middleware xử lý
│   │   │   ├── auth.js          # Xác thực JWT, API Key
│   │   │   ├── errorHandler.js  # Xử lý lỗi tập trung
│   │   │   └── rateLimit.js     # Giới hạn tỷ lệ yêu cầu
│   │   ├── models/              # Schema MongoDB
│   │   │   ├── Candidate.js     # Hồ sơ ứng viên
│   │   │   ├── User.js          # Người dùng hệ thống
│   │   │   └── RefreshToken.js  # Token tái tạo
│   │   ├── routes/              # Các endpoint API
│   │   │   ├── auth.js          # Login, Register, Refresh token
│   │   │   ├── candidates.js    # CRUD & Tìm kiếm ứng viên
│   │   │   ├── admin.js         # Quản lý user, upload dữ liệu
│   │   │   └── export.js        # Xuất CSV, Excel, JSON
│   │   ├── utils/               # Công cụ hỗ trợ
│   │   │   ├── adapter.js       # Chuyển đổi định dạng dữ liệu
│   │   │   ├── dataQuality.js   # Kiểm tra chất lượng dữ liệu
│   │   │   ├── logger.js        # Ghi log Winston
│   │   │   └── redisClient.js   # Kết nối & thao tác Redis
│   │   └── scripts/
│   │       └── importData.js    # Import dữ liệu từ JSON
│   ├── public/                  # Frontend (HTML, CSS, JS)
│   │   ├── index.html           # Trang chủ
│   │   ├── login.html           # Trang đăng nhập
│   │   ├── dashboard.html       # Dashboard quản lý
│   │   ├── admin.html           # Panel quản trị
│   │   ├── js/
│   │   │   └── chart.umd.min.js # Thư viện biểu đồ
│   │   └── authInterceptor.js   # Interceptor axios
│   ├── logs/                    # Thư mục log (tự động tạo)
│   ├── uploads/                 # Thư mục upload file
│   ├── package.json             # Dependencies Node.js
│   ├── server.js                # Entry point chính
│   └── server_local.js          # Entry point development
├── scraper/
│   ├── Script_craw.py           # Script Selenium crawl LinkedIn
│   ├── login.txt                # Credentials (username/password)
│   ├── profiles.txt             # Danh sách URL cần crawl
│   └── text.txt                 # Output tạm thời
├── Data/
│   ├── output.json              # Dữ liệu chính
│   ├── output_temp.json         # Dữ liệu tạm
│   └── backups/                 # Sao lưu dữ liệu
├── docker-compose.yml           # Cấu hình Docker services
├── Dockerfile                   # Build image backend
├── mongo-init.js                # Script khởi tạo MongoDB
└── README.md                    # Tài liệu dự án
```

---

## 🔍 Giải Thích Các File

### **Backend - Middleware**

#### `src/middleware/auth.js` 
**Chức năng:** Xác thực & phân quyền
- `authenticateToken()` - Kiểm tra JWT token hoặc API key
- `authenticateApiKey()` - Xác thực API key
- `generateToken(user)` - Tạo JWT token (8h hết hạn)
- `generateRefreshToken(user)` - Tạo refresh token (30 ngày)
- `verifyRefreshToken()` - Xác minh refresh token
- `requireRole(roles)` - Middleware kiểm tra quyền
- `revokeRefreshToken()` - Thu hồi token
- `revokeAllUserRefreshTokens()` - Thu hồi toàn bộ token user

#### `src/middleware/errorHandler.js`
**Chức năng:** Xử lý lỗi tập trung
- `AppError` - Custom error class cơ bản
- `ValidationError` - Status 400, lỗi dữ liệu không hợp lệ
- `NotFoundError` - Status 404, tài nguyên không tìm thấy
- `UnauthorizedError` - Status 401, không xác thực
- `ForbiddenError` - Status 403, không có quyền
- `ConflictError` - Status 409, conflict (trùng lặp)
- `RateLimitError` - Status 429, vượt giới hạn yêu cầu
- `asyncErrorHandler()` - Wrapper bắt lỗi async function
- `errorHandler()` - Global error handler middleware

#### `src/middleware/rateLimit.js`
**Chức náng:** Giới hạn tỷ lệ yêu cầu
- **authLimiter** - 10 yêu cầu/15 phút (login/register)
- **searchLimiter** - 100 yêu cầu/15 phút (tìm kiếm)
- **apiLimiter** - 300 yêu cầu/15 phút (API chung)
- **uploadLimiter** - 20 yêu cầu/1 giờ (upload file)
- **candidateCreateLimiter** - 50 yêu cầu/1 giờ (tạo ứng viên)
- **exportLimiter** - 10 yêu cầu/1 giờ (xuất dữ liệu)
- Admin không bị giới hạn

### **Backend - Models**

#### `src/models/User.js`
**Chức năng:** Schema người dùng hệ thống

```javascript
{
  username: String (bắt buộc, unique)
  passwordHash: String (bcrypt hash)
  role: 'user' | 'admin'
  email: String (lowercase, unique, sparse)
  isActive: Boolean (default: true)
  lastLogin: Date
  loginAttempts: Number (default: 0)
  lockUntil: Date (khóa sau 5 lần failed)
  apiKey: String (unique, sparse)
  preferences: {
    theme: 'light' | 'dark' | 'auto'
    itemsPerPage: Number (5-100, default: 20)
  }
  timestamps: { createdAt, updatedAt }
}
```

#### `src/models/Candidate.js`
**Chức năng:** Schema hồ sơ ứng viên LinkedIn

```javascript
{
  name: String (bắt buộc, indexed)
  job_title: String (bắt buộc, indexed)
  location: String (indexed)
  linkedin_url: String (unique, validate LinkedIn URL)
  normalized_url: String (unique, URL đã chuẩn hóa)
  email: String (optional)
  total_experience_count: Number (0-100 năm)
  score: Number (0-100, tính điểm profile)
  data_quality_score: Number (0-100)
  status: 'active' | 'dismissed' | 'contacted'
  skills: [String]
  experience: [{
    position: String
    company: String
    employment_type: 'Full-time' | 'Part-time' | 'Contract' | ...
    duration: String
    duration_months: Number
  }]
  education: [{
    school: String
    degree: String
    duration: String
    degree_level: 'High School' | 'Bachelor' | 'Master' | 'PhD' | 'MBA'
  }]
  bio: String
  crawled_at: Date (khi được crawl)
  updated_at: Date
  text_index: (full-text search trên name, job_title, location, skills)
}
```

#### `src/models/RefreshToken.js`
**Chức năng:** Lưu trữ refresh tokens

```javascript
{
  token: String (unique)
  userId: ObjectId (reference to User)
  userAgent: String (trình duyệt/client)
  expiresAt: Date (tự động xóa khi hết hạn)
  revoked: Boolean (false = còn sống)
  createdAt: Date
}
```

### **Backend - Routes (API Endpoints)**

#### `src/routes/auth.js`
**Chức năng:** Xác thực & quản lý token

| Endpoint | Method | Auth | Mô Tả |
|----------|--------|------|-------|
| `/api/auth/login` | POST | ❌ | Đăng nhập → access + refresh token |
| `/api/auth/register` | POST | ❌ | Tạo tài khoản mới |
| `/api/auth/refresh` | POST | ❌ | Lấy access token mới từ refresh token |
| `/api/auth/logout` | POST | ✅ | Đăng xuất (revoke token) |
| `/api/auth/me` | GET | ✅ | Lấy thông tin user hiện tại |

#### `src/routes/candidates.js`
**Chức năng:** CRUD & Tìm kiếm ứng viên

| Endpoint | Method | Auth | Mô Tả |
|----------|--------|------|-------|
| `/api/candidates` | GET | ✅ | Lấy danh sách ứng viên (pagination) |
| `/api/candidates?page=1&limit=20` | GET | ✅ | Phân trang |
| `/api/candidates/:id` | GET | ✅ | Lấy chi tiết 1 ứng viên |
| `/api/candidates` | POST | ✅ | Tạo ứng viên mới |
| `/api/candidates/:id` | PUT | ✅ | Cập nhật ứng viên |
| `/api/candidates/:id` | DELETE | ✅ | Xóa ứng viên |
| `/api/candidates/search?q=keyword` | GET | ✅ | Tìm kiếm cơ bản |
| `/api/candidates/advanced-search?...` | GET | ✅ | Tìm kiếm nâng cao (với bộ lọc) |
| `/api/candidates/statistics/summary` | GET | ✅ | Thống kê tổng hợp |
| `/api/candidates/statistics/distributions?type=job_title` | GET | ✅ | Phân bố theo loại |

#### `src/routes/admin.js`
**Chức năng:** Quản trị hệ thống

| Endpoint | Method | Auth | Yêu cầu | Mô Tả |
|----------|--------|------|---------|-------|
| `/api/admin/users` | GET | ✅ Admin | - | Danh sách tất cả user |
| `/api/admin/users` | POST | ✅ Admin | {username, password, email, role} | Tạo user mới |
| `/api/admin/users/:id` | PUT | ✅ Admin | {email, role, isActive, preferences} | Cập nhật user |
| `/api/admin/users/:id` | DELETE | ✅ Admin | - | Xóa user |
| `/api/admin/users/:id/lock` | POST | ✅ Admin | - | Khóa tài khoản user |
| `/api/admin/users/:id/unlock` | POST | ✅ Admin | - | Mở khóa tài khoản |
| `/api/admin/users/:id/api-key` | POST | ✅ Admin | - | Tạo API key mới cho user |
| `/api/admin/users/:id/revoke-all-tokens` | POST | ✅ Admin | - | Thu hồi tất cả token user |
| `/api/admin/upload` | POST | ✅ Admin | File JSON | Upload & import dữ liệu ứng viên |
| `/api/admin/data-quality` | GET | ✅ Admin | - | Báo cáo chất lượng dữ liệu |
| `/api/admin/audit-log` | GET | ✅ Admin | - | Xem audit log hành động quản trị |
| `/api/admin/cache-stats` | GET | ✅ Admin | - | Thống kê Redis cache |
| `/api/admin/database-stats` | GET | ✅ Admin | - | Thống kê cơ sở dữ liệu |

#### `src/routes/export.js`
**Chức năng:** Xuất dữ liệu

| Endpoint | Method | Auth | Query | Mô Tả |
|----------|--------|------|-------|-------|
| `/api/export/csv` | GET | ✅ | filter, limit | Export CSV |
| `/api/export/excel` | GET | ✅ | filter, limit | Export Excel |
| `/api/export/json` | GET | ✅ | filter, limit | Export JSON |
| `/api/export/zip` | GET | ✅ | format, filter, limit | Export ZIP (tất cả format) |

### **Backend - Utils**

#### `src/utils/logger.js`
**Chức năng:** Ghi log Winston toàn hệ thống

```javascript
logger.info('Thông tin chung')
logger.error('Lỗi')
logger.warn('Cảnh báo')
logger.debug('Debug info')
logger.audit('Hành động quản trị', {userId, action, ...})
```

Log được lưu vào:
- `logs/combined.log` - Tất cả log
- `logs/error.log` - Chỉ lỗi
- `logs/http.log` - HTTP requests
- `logs/audit.log` - Hành động quản trị

#### `src/utils/redisClient.js`
**Chức năng:** Quản lý cache Redis

```javascript
await connectRedis()          // Kết nối Redis
await redisClient.get(key)    // Lấy dữ liệu
await redisClient.set(key, value, ttl)  // Lưu dữ liệu
await redisClient.del(key)    // Xóa dữ liệu
const cacheWrapper = cacheWrapper('prefix', 300) // Wrapper cache 300s
```

#### `src/utils/dataQuality.js`
**Chức năng:** Kiểm tra chất lượng dữ liệu

```javascript
const result = DataQualityChecker.validateProfile(candidate)
// {
//   isValid: Boolean
//   errors: [String]       // Lỗi (required fields)
//   warnings: [String]     // Cảnh báo (missing optional fields)
//   qualityScore: 0-100    // Điểm chất lượng
// }
```

Kiểm tra:
- ✅ Tên, job title bắt buộc
- ✅ URL LinkedIn hợp lệ
- ✅ Email format
- ✅ Kinh nghiệm & số tháng
- ✅ Giáo dục hợp lệ
- ✅ Kỹ năng không rỗng
- ⚠️ Dữ liệu nghi ngờ (e.g., tên quá dài)

#### `src/utils/adapter.js`
**Chức năng:** Chuyển đổi định dạng dữ liệu
- MongoDB từ/sang JSON
- Chuẩn hóa dữ liệu từ crawler

---

## ⚙️ Cách Hoạt Động Các Module

### 1️⃣ **Xác Thực & Phân Quyền (Authentication & Authorization)**

```
┌─────────────────────────────────────────┐
│  Client yêu cầu: GET /api/candidates   │
│  Headers: Authorization: Bearer <token>│
└─────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│  authenticateToken() middleware         │
│  1. Extract token từ header             │
│  2. Kiểm tra blacklist Redis            │
│  3. Verify JWT signature & expiration   │
│  4. Đặt req.user                        │
│  5. Gọi next() hoặc 401/403 response   │
└─────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│  requireRole(['admin']) middleware      │
│  Kiểm tra req.user.role                 │
│  Admin được qua, user khác không        │
└─────────────────────────────────────────┘
           │
           ▼
      Handler Route
```

**Flow Login:**
```javascript
POST /api/auth/login
  1. Validate username, password
  2. Find user từ MongoDB
  3. Check user.isLocked() → 403
  4. Check user.isActive → 403
  5. bcrypt.compare(password, user.passwordHash)
  6. If fail → incLoginAttempts() → 401
  7. If success → resetLoginAttempts()
  8. Generate JWT (8h) → accessToken
  9. Generate Refresh Token (30d) → DB + Redis
  10. Return { user, tokens }
```

### 2️⃣ **Tìm Kiếm & Filtering (Search)**

```
┌──────────────────────────────────────────┐
│ GET /api/candidates/search?q=python     │
│ GET /api/candidates/advanced-search?... │
└──────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│  searchLimiter middleware                │
│  Max 100 requests/15 min                 │
│  Skip successful requests (non-counted)  │
└──────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│  Build MongoDB query:                    │
│  $or: [                                  │
│    { name: /python/i }                  │
│    { job_title: /python/i }             │
│    { skills: /python/i }                │
│    { experience.company: /python/i }    │
│  ]                                       │
└──────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│  Advanced Search Filters:                │
│  - minExperience, maxExperience         │
│  - educationLevels: Bachelor, Master    │
│  - skills: [skill1, skill2]             │
│  - location, employmentTypes            │
│  - minScore, maxScore                   │
│  - sortBy, sortOrder                    │
└──────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│  cacheWrapper('candidates', 300)         │
│  1. Check Redis cache (key)              │
│  2. If cache hit → return cached data   │
│  3. If cache miss → query MongoDB       │
│  4. Cache result 300s (5 min)           │
│  5. Return data                          │
└──────────────────────────────────────────┘
           │
           ▼
    Response + Pagination
    {
      success: true,
      data: [...candidates],
      pagination: {
        page: 1,
        limit: 20,
        total: 150,
        pages: 8,
        hasNext: true,
        hasPrev: false
      }
    }
```

### 3️⃣ **Xác Thực Chất Lượng Dữ Liệu (Data Quality)**

```
┌───────────────────────────────────────┐
│  POST /api/candidates (new candidate) │
│  PUT /api/candidates/:id (update)     │
│  admin/upload (batch import)          │
└───────────────────────────────────────┘
           │
           ▼
┌───────────────────────────────────────┐
│ DataQualityChecker.validateProfile()  │
│                                       │
│ ❌ ERRORS (phải sửa):                │
│  - Name required, 2-100 chars        │
│  - Job title required                │
│  - LinkedIn URL valid format         │
│  - Email format nếu có               │
│  - Experience: position, company      │
│  - Education: school, degree_level    │
│                                       │
│ ⚠️  WARNINGS (cảnh báo):             │
│  - Name quá dài (>60 chars)          │
│  - LinkedIn URL missing              │
│  - Kinh nghiệm >50 năm (nghi ngờ)    │
│  - Kỹ năng rỗng                      │
│  - Skills >100 (quá nhiều)           │
│  - Email không có @ hoặc domain      │
│                                       │
│ ✅ QUALITY SCORE (0-100):            │
│  Base: 100                            │
│  -5 per error                         │
│  -2 per warning                       │
│  Min score: 0                         │
└───────────────────────────────────────┘
           │
           ▼
┌───────────────────────────────────────┐
│ isValid = (errors.length === 0)?      │
│ Nếu có errors → 400 Bad Request       │
│ Nếu OK → Save to DB + cache update   │
└───────────────────────────────────────┘
```

### 4️⃣ **Rate Limiting (Giới Hạn Yêu Cầu)**

```
Request đến → Rate Limit Middleware

┌──────────────────────────────────────┐
│  Store: Redis or Memory              │
│  keyGenerator:                       │
│    - req.user.id (nếu authenticated)│
│    - req.ip (nếu anonymous)         │
│                                      │
│  Skip nếu:                           │
│    - user.role === 'admin'          │
│    - path === '/health'             │
│    - dev mode + localhost           │
└──────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ Kiểm tra count trong window          │
│                                      │
│ count < max → ✅ Allow               │
│              → Increment count       │
│              → Pass to handler       │
│                                      │
│ count >= max → ❌ Block              │
│              → 429 Too Many Requests │
│              → Log warning           │
│              → Retry-After header    │
└──────────────────────────────────────┘

Các limiter:
- authLimiter: 10/15min (login/register)
- searchLimiter: 100/15min (search)
- apiLimiter: 300/15min (general)
- uploadLimiter: 20/1hour (upload)
- candidateCreateLimiter: 50/1hour (create)
- exportLimiter: 10/1hour (export)
```

### 5️⃣ **Xử Lý Lỗi (Error Handling)**

```
Application Error Hierarchy:

AppError (base class)
├── ValidationError (400)
│   ├── Missing fields
│   ├── Invalid format
│   └── Out of range
├── NotFoundError (404)
│   ├── Resource not found
│   └── User not found
├── UnauthorizedError (401)
│   ├── No token provided
│   └── Invalid credentials
├── ForbiddenError (403)
│   ├── Insufficient permissions
│   └── Account locked
├── ConflictError (409)
│   ├── Duplicate username
│   └── Email already exists
└── RateLimitError (429)
    └── Too many requests

Flow:
┌──────────────────────┐
│ Handler throws error │
└───────┬──────────────┘
        │
        ▼
┌──────────────────────────────────┐
│ asyncErrorHandler wrapper        │
│ Catches Promise rejection        │
│ Passes to next(error)           │
└───────┬──────────────────────────┘
        │
        ▼
┌──────────────────────────────────┐
│ Global errorHandler middleware   │
│ 1. Log error + stack trace      │
│ 2. Identify error type          │
│ 3. Convert to response format   │
│ 4. Return JSON response         │
└───────┬──────────────────────────┘
        │
        ▼
┌──────────────────────────────────┐
│ Client receives:                 │
│ {                                │
│   success: false,               │
│   error: {                       │
│     message: "...",             │
│     code: "ERROR_CODE",         │
│     details: {...}              │
│   }                              │
│ }                                │
└──────────────────────────────────┘
```

### 6️⃣ **Caching với Redis (Redis Caching)**

```
Request GET /api/candidates?search=python

  ▼
Has Redis connected?
  │
  ├─ YES ─┐
  │       │
  │       ▼
  │  Key = 'cache:candidates:search:python'
  │       │
  │       ├─ Key exists in Redis?
  │       │  │
  │       │  ├─ YES ─► Return cached data (fast!) ✅
  │       │  │
  │       │  └─ NO ──┐
  │       │          │
  │       └──────────┤
  │                  │
  │       ▼
  │  Query MongoDB
  │       │
  │       ▼
  │  redisClient.set(key, data, 300) [TTL 5 min]
  │       │
  │       ▼
  │  Return data
  │
  └─ NO ──► Query MongoDB directly (slower)
          → Return data (no cache)

Benefits:
✅ Faster response (sub-ms)
✅ Less MongoDB load
✅ Auto-expire after TTL
✅ Fallback if Redis down
```

---

## 🛡️ Xử Lý Lỗi

### **Error Codes Reference**

| Code | Status | Mô Tả |
|------|--------|-------|
| `VALIDATION_ERROR` | 400 | Dữ liệu không hợp lệ (format, required fields) |
| `NOT_FOUND` | 404 | Tài nguyên không tìm thấy |
| `INVALID_ID` | 400 | ID format không hợp lệ |
| `DUPLICATE_ENTRY` | 409 | Trùng lặp (bất kỳ field unique) |
| `MISSING_CREDENTIALS` | 400 | Thiếu username/password |
| `INVALID_CREDENTIALS` | 401 | Username/password sai |
| `ACCOUNT_LOCKED` | 403 | Tài khoản bị khóa (>5 lần failed login) |
| `ACCOUNT_INACTIVE` | 403 | Tài khoản không hoạt động |
| `NO_AUTH_TOKEN` | 401 | Không có token hoặc API key |
| `TOKEN_EXPIRED` | 401 | JWT token hết hạn |
| `INVALID_TOKEN` | 403 | JWT token không hợp lệ |
| `TOKEN_REVOKED` | 401 | Token đã bị thu hồi |
| `INVALID_API_KEY` | 403 | API key không hợp lệ |
| `INSUFFICIENT_PERMISSIONS` | 403 | Không có quyền truy cập |
| `RATE_LIMIT_EXCEEDED` | 429 | Vượt giới hạn yêu cầu |
| `INTERNAL_SERVER_ERROR` | 500 | Lỗi server |

### **Error Response Format**

```json
{
  "success": false,
  "error": {
    "message": "User already exists",
    "code": "USERNAME_EXISTS",
    "details": {
      "field": "username",
      "value": "john_doe"
    }
  }
}
```

---

## 📊 Các Endpoint API

### **Authentication (Xác Thực)**

#### Login
```bash
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
      "role": "admin",
      "email": "admin@example.com"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIs...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
      "expiresIn": 28800
    }
  }
}
```

#### Register
```bash
POST /api/auth/register
Content-Type: application/json

{
  "username": "newuser",
  "password": "password123",
  "email": "user@example.com"
}

Response 201: Tương tự Login
```

#### Refresh Token
```bash
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}

Response 200:
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

### **Candidates (Ứng Viên)**

#### Lấy Danh Sách
```bash
GET /api/candidates?page=1&limit=20&status=active

Headers:
Authorization: Bearer <accessToken>

Response 200:
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "name": "John Doe",
      "job_title": "Software Engineer",
      "location": "Ho Chi Minh City",
      "score": 85,
      "data_quality_score": 92,
      "experience": [...],
      "education": [...],
      "skills": ["Python", "JavaScript", "MongoDB"]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8,
    "hasNext": true,
    "hasPrev": false
  }
}
```

#### Tìm Kiếm Nâng Cao
```bash
GET /api/candidates/advanced-search?
  q=python&
  minExperience=2&
  maxExperience=10&
  educationLevels=Bachelor,Master&
  skills=Python,JavaScript&
  location=Ho%20Chi%20Minh&
  minScore=70&
  page=1&
  limit=20&
  sortBy=score&
  sortOrder=desc

Response: Tương tự danh sách
```

#### Thống Kê
```bash
GET /api/candidates/statistics/summary
GET /api/candidates/statistics/distributions?type=job_title&limit=10

Response:
{
  "success": true,
  "data": {
    "totalCandidates": 500,
    "avgExperience": 5.2,
    "avgScore": 78.5,
    "avgQuality": 84.2
  },
  // distributions
  "data": [
    { "label": "Software Engineer", "count": 150, "percentage": 30 },
    { "label": "Product Manager", "count": 100, "percentage": 20 }
  ]
}
```

#### Tạo Ứng Viên
```bash
POST /api/candidates
Content-Type: application/json

{
  "name": "Jane Smith",
  "job_title": "Data Scientist",
  "location": "Hanoi",
  "linkedin_url": "https://linkedin.com/in/jane-smith",
  "email": "jane@example.com",
  "skills": ["Python", "Machine Learning", "SQL"],
  "experience": [
    {
      "position": "Data Scientist",
      "company": "TechCorp",
      "employment_type": "Full-time",
      "duration": "2021-2024",
      "duration_months": 36
    }
  ],
  "education": [
    {
      "school": "University of Technology",
      "degree": "Master in Data Science",
      "degree_level": "Master",
      "duration": "2019-2021"
    }
  ]
}

Response 201: candidate object + data_quality_score
```

### **Admin (Quản Trị)**

#### Quản Lý User
```bash
# Danh sách
GET /api/admin/users

# Tạo user
POST /api/admin/users
{
  "username": "newadmin",
  "password": "secure123",
  "email": "admin@example.com",
  "role": "admin"
}

# Cập nhật
PUT /api/admin/users/:id
{
  "email": "newemail@example.com",
  "role": "user",
  "isActive": true
}

# Xóa
DELETE /api/admin/users/:id

# Khóa/Mở khóa
POST /api/admin/users/:id/lock
POST /api/admin/users/:id/unlock

# Tạo API key
POST /api/admin/users/:id/api-key
Response: { "apiKey": "..." }

# Thu hồi tất cả token
POST /api/admin/users/:id/revoke-all-tokens
```

#### Upload Dữ Liệu
```bash
POST /api/admin/upload
Content-Type: multipart/form-data

Form Data:
- file: output.json (JSON file)

Response:
{
  "success": true,
  "message": "Data imported successfully",
  "data": {
    "importedCount": 500,
    "failedCount": 2,
    "errors": [
      { "index": 5, "error": "Invalid email" }
    ]
  }
}
```

#### Chất Lượng Dữ Liệu
```bash
GET /api/admin/data-quality?limit=100

Response:
{
  "success": true,
  "data": {
    "totalRecords": 500,
    "validRecords": 485,
    "invalidRecords": 15,
    "avgQualityScore": 84.2,
    "invalids": [
      {
        "id": "...",
        "name": "...",
        "errors": ["Name is required"]
      }
    ]
  }
}
```

### **Export (Xuất Dữ Liệu)**

#### Export CSV
```bash
GET /api/export/csv?filter={"status":"active"}&limit=1000

Response: CSV file download
```

#### Export Excel
```bash
GET /api/export/excel?filter={"status":"active"}&limit=1000

Response: Excel file (.xlsx) download
```

#### Export JSON
```bash
GET /api/export/json?filter={"status":"active"}&limit=1000

Response: 
{
  "success": true,
  "data": [...]
}
```

#### Export ZIP (All formats)
```bash
GET /api/export/zip?format=all&filter={"status":"active"}&limit=1000

Response: ZIP file (.zip) containing CSV, Excel, JSON
```

---

## 💻 Lệnh Chạy

### **Development**

```bash
# Cài dependencies
npm install

# Chạy với hot-reload (nodemon)
npm run dev

# Chạy server local (với hardcoded credentials)
npm start local

# Chạy normallly
npm start
```

### **Database & Data**

```bash
# Import dữ liệu từ JSON
npm run import

# Test kết nối MongoDB
npm test

# Khởi tạo MongoDB (trong container)
docker-compose exec mongodb mongosh < mongo-init.js
```

### **Docker**

```bash
# Build image
docker build -t linkedin-backend .

# Run container
docker run -p 3000:3000 linkedin-backend

# Docker Compose (tất cả services)
docker-compose up -d
docker-compose logs -f
docker-compose down

# Logs
docker-compose logs app
docker-compose logs mongodb
docker-compose logs redis
```

### **Python Scraper**

```bash
# Crawl LinkedIn
cd scraper
python Script_craw.py

# Chuẩn bị credentials
# Edit login.txt: line 1 = username, line 2 = password
# Edit profiles.txt: danh sách URL cần crawl
```

### **Health Check**

```bash
# Kiểm tra server
curl http://localhost:3000/health
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/statistics

# Kiểm tra MongoDB
mongosh --authenticationDatabase admin -u admin -p admin123 mongodb://localhost:27017

# Kiểm tra Redis
redis-cli ping
```

---

## 🤖 Biến Môi Trường

Tạo file `.env` trong `backend/`:

```env
# ===== Server =====
NODE_ENV=development
PORT=3000
BASE_URL=http://localhost:3000

# ===== Database MongoDB =====
MONGODB_URI=mongodb://admin:admin123@localhost:27017/linkedin_candidates?authSource=admin
MONGODB_USER=admin
MONGODB_PASSWORD=admin123
MONGODB_HOST=localhost
MONGODB_PORT=27017
MONGODB_DB=linkedin_candidates

# ===== Cache Redis =====
REDIS_URL=redis://localhost:6379
REDIS_TTL=3600

# ===== JWT =====
JWT_SECRET=your_super_secret_jwt_key_change_in_production_12345!@#
JWT_EXPIRES_IN=8h
REFRESH_TOKEN_EXPIRES_IN=30d

# ===== File Upload =====
MAX_FILE_SIZE=10485760
UPLOAD_PATH=./uploads

# ===== Logging =====
LOG_LEVEL=debug

# ===== CORS =====
CORS_ORIGIN=http://localhost:3000

# ===== Security =====
RATE_LIMIT_WINDOW=15m
RATE_LIMIT_MAX_REQUESTS=100
```

**Biến quan trọng:**
- `JWT_SECRET` - Đổi giá trị trong production (tối thiểu 32 ký tự)
- `MONGODB_URI` - Chuỗi kết nối MongoDB
- `REDIS_URL` - URL Redis server
- `NODE_ENV` - "development" or "production"
- `MAX_FILE_SIZE` - Giới hạn upload (bytes)

---

## 📝 Đoạn Code Quan Trọng

### **1. JWT Token Generation**

```javascript
// src/middleware/auth.js
function generateToken(user) {
  return jwt.sign(
    {
      id: user._id,
      username: user.username,
      role: user.role,
      isActive: user.isActive,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    }
  );
}

// Sử dụng:
const accessToken = generateToken(user);
// Token hết hạn sau 8 giờ
```

### **2. Rate Limiting Middleware**

```javascript
// src/middleware/rateLimit.js
const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,  // 15 phút
  max: 10,                    // 10 request max
  message: 'Too many login attempts',
  skips: (req) => {
    // Admin không bị giới hạn
    if (req.user && req.user.role === 'admin') return true;
    // Localhost development không bị giới hạn
    if (process.env.NODE_ENV === 'development' && req.ip === '::1') return true;
    return false;
  },
});

// Sử dụng:
router.post('/login', authLimiter, handler);
```

### **3. Data Quality Checking**

```javascript
// src/utils/dataQuality.js
const result = DataQualityChecker.validateProfile({
  name: 'John Doe',
  job_title: 'Software Engineer',
  linkedin_url: 'https://linkedin.com/in/john-doe',
  skills: ['Python', 'JavaScript'],
  experience: [...]
});

if (!result.isValid) {
  // Lỗi - không lưu vào database
  res.status(400).json({ errors: result.errors });
} else {
  // OK - lưu với data_quality_score
  candidate.data_quality_score = result.qualityScore;
  await candidate.save();
}
```

### **4. Redis Caching**

```javascript
// src/utils/redisClient.js
const candidateCache = cacheWrapper('candidates', 300); // 300s TTL

// Sử dụng:
const candidates = await candidateCache.get('search:python', async () => {
  // Callback: executed nếu cache miss
  return await Candidate.find({ skills: 'Python' }).limit(20);
});

// Lần gọi lại:
// - Nếu <5 min từ lần trước → return cached data (fast!)
// - Nếu >5 min → query MongoDB → cache lại
```

### **5. Async Error Handler**

```javascript
// src/middleware/errorHandler.js
const asyncErrorHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Sử dụng trong route:
router.get('/candidates/:id', asyncErrorHandler(async (req, res) => {
  const candidate = await Candidate.findById(req.params.id);
  if (!candidate) {
    throw new NotFoundError('Candidate not found');
  }
  res.json({ success: true, data: candidate });
  // Error tự động được catch & xử lý bởi global error handler
}));
```

### **6. Validation Error**

```javascript
// Kiểm tra dữ liệu đầu vào
if (!username || !password) {
  throw new ValidationError('Username and password required', {
    code: 'MISSING_CREDENTIALS'
  });
}

if (!/^[a-zA-Z0-9_]+$/.test(username)) {
  throw new ValidationError('Username only letters, numbers, underscore', {
    code: 'INVALID_USERNAME_FORMAT'
  });
}

// Tự động trả về 400 + error message
```

### **7. Middleware Chain Example**

```javascript
// Route được bảo vệ bởi nhiều middleware
router.get(
  '/candidates/search',
  authenticateToken,        // Kiểm tra JWT
  requireRole(['user']),     // Kiểm tra quyền
  searchLimiter,              // Giới hạn yêu cầu
  asyncErrorHandler(async (req, res) => {
    // Handler
  })
);
```

### **8. MongoDB Model with Validation**

```javascript
// src/models/Candidate.js
const CandidateSchema = new Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [100, 'Name cannot exceed 100 characters'],
    trim: true,
    index: true
  },
  linkedin_url: {
    type: String,
    unique: true,
    sparse: true,
    validate: {
      validator: function(v) {
        return /^https?:\/\/(www\.)?linkedin\.com\/in\/[^\s\/]+/.test(v);
      },
      message: 'Invalid LinkedIn URL'
    }
  }
  // ...
});

// Index cho tìm kiếm
CandidateSchema.index({ name: 'text', job_title: 'text' });
```

### **9. Export to CSV Example**

```javascript
// src/routes/export.js
router.get('/csv', authenticateToken, exportLimiter, asyncErrorHandler(async (req, res) => {
  const { filter, limit } = req.query;
  const query = filter ? JSON.parse(filter) : {};
  
  const candidates = await Candidate.find(query)
    .limit(parseInt(limit))
    .sort({ score: -1 })
    .lean();
  
  const fields = ['Name', 'Job Title', 'Location', 'Skills', ...];
  const parser = new Parser({ fields });
  const csv = parser.parse(candidates);
  
  res.type('text/csv');
  res.attachment('candidates.csv');
  res.send(csv);
}));
```

### **10. Admin User Management**

```javascript
// src/routes/admin.js
router.post('/users', authenticateToken, requireRole(['admin']), asyncErrorHandler(async (req, res) => {
  const { username, password, email, role } = req.body;
  
  // Validation
  if (!username || !password) {
    throw new ValidationError('Username and password are required');
  }
  
  // Check duplicate
  const existing = await User.findOne({ username });
  if (existing) {
    throw new ValidationError('Username already exists');
  }
  
  // Hash password
  const hashedPassword = await bcrypt.hash(password, 12);
  
  // Create user
  const user = new User({
    username,
    passwordHash: hashedPassword,
    email,
    role: role || 'user',
  });
  await user.save();
  
  // Audit log
  logger.audit('User created by admin', {
    adminId: req.user.id,
    newUsername: user.username,
    role: user.role,
  });
  
  res.status(201).json({ success: true, data: user });
}));
```

---

## 🔐 Security Best Practices

1. **JWT Secret** - Sử dụng giá trị dài, ngẫu nhiên, bằng chữ, số, ký tự đặc biệt
   ```bash
   openssl rand -base64 32  # Generate random secret
   ```

2. **Password Hashing** - bcrypt với 12 rounds (tuning+salt)
   ```javascript
   const hashed = await bcrypt.hash(password, 12);
   ```

3. **Rate Limiting** - Bảo vệ chống brute force
   - Login: 10/15min
   - Upload: 20/1hour
   - Export: 10/1hour

4. **CORS** - Chỉ cho phép origin tin cậy
   ```javascript
   cors({
     origin: ['http://localhost:3000'],  // Development
     credentials: true
   })
   ```

5. **Input Validation** - Sanitize tất cả input
   ```javascript
   mongoSanitize()  // Chống NoSQL injection
   helmet()         // Security headers
   ```

6. **Token Blacklist** - Thu hồi token qua Redis
   ```javascript
   await redisClient.set(`blacklist:${token}`, 'revoked', 3600);
   ```

7. **Audit Logging** - Ghi lại hành động quản trị
   ```javascript
   logger.audit('User created', { adminId, newUserId, ip });
   ```

---

## 📊 Cấu Trúc Database

### **MongoDB Collections**

#### 1. **candidates** Collection
```javascript
{
  _id: ObjectId,
  name: String,
  job_title: String,
  location: String,
  linkedin_url: String (unique),
  normalized_url: String (unique),
  email: String,
  bio: String,
  total_experience_count: Number,
  skills: [String],
  experience: [{
    position: String,
    company: String,
    employment_type: String,
    duration: String,
    duration_months: Number
  }],
  education: [{
    school: String,
    degree: String,
    duration: String,
    degree_level: String
  }],
  score: Number,
  data_quality_score: Number,
  status: String,
  crawled_at: Date,
  updated_at: Date,
  createdAt: Date,
  updatedAt: Date
}

Indexes:
- name, job_title, location, linkedin_url
- score (cho sorting)
- total_experience_count
- status
- Text index trên name, job_title, location, skills
```

#### 2. **users** Collection
```javascript
{
  _id: ObjectId,
  username: String (unique),
  passwordHash: String,
  role: String (user/admin),
  email: String (unique, sparse),
  isActive: Boolean,
  lastLogin: Date,
  loginAttempts: Number,
  lockUntil: Date,
  apiKey: String (unique, sparse),
  preferences: {
    theme: String,
    itemsPerPage: Number
  },
  createdAt: Date,
  updatedAt: Date
}

Indexes:
- username (unique)
- email (unique, sparse)
- role
- isActive
- apiKey (unique, sparse)
```

#### 3. **refreshtokens** Collection
```javascript
{
  _id: ObjectId,
  token: String (unique),
  userId: ObjectId (reference to users),
  userAgent: String,
  expiresAt: Date (TTL index),
  revoked: Boolean,
  createdAt: Date
}

Indexes:
- token (unique, fast lookup)
- userId (filter by user)
- expiresAt (TTL auto-delete)
- userId + revoked (query active tokens)
```

---

## 🚀 Performance Tips

1. **Database Queries**
   - Sử dụng `.lean()` cho readonly queries
   - Index trên fields hay search
   - Paginate results (limit + skip)

2. **Caching**
   - Redis TTL = 300s (5min) cho search results
   - Invalidate cache khi update/delete
   - Fallback nếu Redis down

3. **Rate Limiting**
   - Redis store (nhanh hơn memory)
   - Skip successful requests (đừng count read-only)
   - Admin bypass (improve UX)

4. **Logging**
   - Rotate logs (5MB/file, max 10 files)
   - Log level = 'info' in production (ít logs)
   - Async file writes (don't block)

5. **API Response**
   - Pagination (default limit=20)
   - Lean queries (exclude __v, etc)
   - Gzip compression (Express automatic)

---

## ⚠️ Known Issues & Solutions

| Vấn đề | Nguyên Nhân | Giải Pháp |
|-------|-----------|---------|
| Redis connection timeout | Redis down/unreachable | Check `REDIS_URL`, start Redis service |
| MongoDB auth failed | Credentials sai | Verify `MONGODB_URI`, check mongo-init.js |
| Port 3000 already in use | Process khác dùng port | `lsof -i :3000` & kill hoặc đổi PORT |
| Rate limit bypass không work | Redis not connected | Start Redis hoặc use memory store |
| Token refresh failed | Refresh token expired/revoked | Login lại (issue new tokens) |
| CSV export empty | Filter không match records | Check filter JSON, loosen conditions |
| Data quality score low | Missing fields | Fill in education, skills, experience |

---

## 📞 Support & Contact

**Tác giả:** Dư Quốc Việt

**Email:** [your-email@example.com]

**GitHub:** [repository](https://github.com/viet-du/Craw-linkedln-Back-end-basic-)

---

## 📜 License

MIT License - Xem file LICENSE để chi tiết

---

## 🎉 Cập Nhật Gần Đây

- ✅ JWT Authentication with Refresh Tokens
- ✅ Redis Caching Layer
- ✅ Rate Limiting (per user & per IP)
- ✅ Data Quality Scoring & Validation
- ✅ Admin Panel with User Management
- ✅ Advanced Search with Filters
- ✅ CSV/Excel/JSON Export
- ✅ Docker & Docker Compose Support
- ✅ Winston Logging System
- ✅ Comprehensive Error Handling

---

**Last Updated:** 2026-02-12
**Version:** 1.0.0
**Status:** Production Ready ✅
