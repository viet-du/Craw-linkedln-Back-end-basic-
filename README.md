# LinkedIn Candidates Crawler + Backend API

## Tổng quan

Dự án gồm 2 phần chính:

- `scraper/` (Python + Selenium): crawl hồ sơ LinkedIn, đẩy dữ liệu qua Kafka, lưu JSON.
- `backend/` (Node.js + Express): API quản lý ứng viên, xác thực JWT, phân quyền, thống kê, export dữ liệu.

Hạ tầng đi kèm:

- MongoDB (lưu dữ liệu)
- Redis (cache, rate limit, blacklist token)
- Kafka + Zookeeper (stream và backup dữ liệu crawler)
- Docker Compose (chạy full stack nhanh)

---

## Kiến trúc nhanh

1. Crawler login LinkedIn và thu thập profile.
2. Crawler ghi `Data/output.json` và publish lên Kafka topic `linkedin-profiles`.
3. `scraper/kafka_consumer.py` nhận dữ liệu và backup theo ngày vào `Data/backup_data/profiles_YYYY-MM-DD.json`.
4. Backend import dữ liệu JSON vào MongoDB.
5. Dashboard/API đọc từ MongoDB (kèm cache Redis).

---

## Cấu trúc thư mục

```text
linkedlin/
├── backend/
│   ├── public/
│   │   ├── index.html
│   │   ├── login.html
│   │   ├── dashboard.html
│   │   ├── admin.html
│   │   ├── authInterceptor.js
│   │   └── js/chart.umd.min.js
│   ├── src/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── scripts/importData.js
│   │   └── utils/
│   ├── server.js
│   ├── server_local.js
│   └── package.json
├── scraper/
│   ├── Script_craw.py
│   ├── Script-run(task-table).py
│   ├── kafka_consumer.py
│   ├── login.txt
│   └── profiles.txt
├── Data/
│   ├── output.json
│   ├── crawl_meta.json
│   └── backup_data/
├── docker-compose.yml
├── Dockerfile
└── mongo-init.js
```

---

## Yêu cầu môi trường

- Node.js >= 18
- npm >= 9
- Python >= 3.8
- Docker + Docker Compose (khuyến nghị)
- Chrome + ChromeDriver (cho Selenium)

Python package chính:

- `selenium`
- `beautifulsoup4`
- `kafka-python`

---

## Chạy nhanh bằng Docker Compose (khuyến nghị)

```bash
docker-compose up -d
docker-compose ps
docker-compose logs -f app
```

Các service:

- Backend: `http://localhost:3000`
- MongoDB: `localhost:27017`
- Redis: `localhost:6379`
- Kafka: `localhost:9092`

Dừng:

```bash
docker-compose down
docker-compose down -v
```

---

## Chạy backend local

### 1) Cấu hình `.env`

Tạo file `backend/.env`:

```env
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://admin:admin123@localhost:27017/linkedin_candidates?authSource=admin
REDIS_URL=redis://localhost:6379
REDIS_TTL=3600
JWT_SECRET=your_super_secret_min_32_chars
JWT_EXPIRES_IN=8h
MAX_FILE_SIZE=10485760
UPLOAD_PATH=./uploads
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
ADMIN_EMAIL=admin@example.com
```

### 2) Cài và chạy

```bash
cd backend
npm install
npm run dev
```

Endpoints nhanh:

- `GET /health`
- `GET /api-docs`
- UI: `http://localhost:3000/`

---

## Crawler: 2 script đúng mục đích

Trong project có **2 script crawler chính** như bạn nói:

### 1) Script chạy bình thường (interactive)

File: `scraper/Script_craw.py`

- Chạy thủ công, hỏi input trong lúc chạy (thời gian lọc, số trang, số profile...).
- Phù hợp khi test nhanh hoặc vận hành thủ công.

Chạy:

```bash
python scraper/Script_craw.py
```

### 2) Script có tham số (dành cho chạy tự động)

File: `scraper/Script-run(task-table).py`

- Hỗ trợ tham số CLI để tích hợp Task Scheduler/cron/CI.
- Dùng khi muốn automation ổn định, không nhập tay.

Ví dụ:

```bash
python "scraper/Script-run(task-table).py" --hours 24 --max-profiles 100 --pages 3
```

Tham số:

- `--hours`: lọc profile theo số giờ gần nhất.
- `--max-profiles`: giới hạn số profile crawl tối đa.
- `--pages`: số trang kết quả cần quét.

---

## Lặp lịch crawler (scheduler)

File: `scraper/scheduler.py`

- Dùng `APScheduler` với timezone `Asia/Ho_Chi_Minh`.
- Job hiện tại đang chạy theo cron tại các mốc: `08:00`, `11:00`, `14:00`, `18:00` mỗi ngày.
- Job gọi hàm crawl với tham số: `run_crawler(hours=24, max_profiles=90, pages=4)`.

Chạy scheduler:

```bash
python scraper/scheduler.py
```

Nếu muốn đổi mốc giờ lặp, sửa dòng:

```python
trigger=CronTrigger(hour='8,11,14,18', minute=0)
```

Ví dụ chỉ chạy 2 lần/ngày:

```python
trigger=CronTrigger(hour='9,21', minute=0)
```

Nếu muốn chạy theo chu kỳ cố định (ví dụ mỗi 24 giờ) thay vì theo giờ cố định trong ngày, dùng job `interval` (đã có mẫu comment trong file).

---

## Kafka backup consumer

File: `scraper/kafka_consumer.py`

- Consume topic `linkedin-profiles`.
- Backup theo ngày vào `Data/backup_data/profiles_YYYY-MM-DD.json`.

Chạy:

```bash
python scraper/kafka_consumer.py
```

---

## Import dữ liệu vào MongoDB

Từ backend:

```bash
cd backend
npm run import
```

Script import cho phép:

- Upsert (cập nhật nếu tồn tại)
- Insert only (bỏ qua bản ghi đã có)
- Replace all (xóa cũ rồi import lại)

---

## API chính

### Auth

- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Candidates

- `GET /api/candidates`
- `GET /api/candidates/search?q=...`
- `GET /api/candidates/advanced-search?...`
- `GET /api/candidates/statistics/summary`
- `GET /api/candidates/statistics/distributions?type=job_title|skills|location|education_level`
- `GET /api/candidates/top/experience`
- `GET /api/candidates/top/education`
- `POST /api/candidates`
- `PUT /api/candidates/:id`
- `DELETE /api/candidates/:id`
- `POST /api/candidates/validate`
- `POST /api/candidates/batch-validate`

### Admin

- `GET /api/admin/users`
- `POST /api/admin/users`
- `PUT /api/admin/users/:id`
- `DELETE /api/admin/users/:id`
- `POST /api/admin/import`
- `DELETE /api/admin/batch`
- `PATCH /api/admin/batch`
- `GET /api/admin/export`
- `GET /api/admin/statistics`
- `POST /api/admin/clear-cache`
- `GET /api/admin/data-quality-report`

### Export

- `GET /api/export/csv`
- `GET /api/export/excel`
- `GET /api/export/json`
- `GET /api/export/with-photos` (admin)
- `GET /api/export/bulk` (admin)

---

## Bảo mật và lưu ý

- Không commit `scraper/login.txt` (chứa credential thật).
- Đổi ngay tài khoản admin mặc định trước khi triển khai thật.
- Cấu hình `JWT_SECRET` mạnh.
- Tuân thủ chính sách sử dụng dữ liệu và điều khoản LinkedIn.

---

## Troubleshooting nhanh

- Backend không lên:
- Kiểm tra `MONGODB_URI`, `REDIS_URL`, `JWT_SECRET` trong `.env`.
- Xem log tại `backend/logs/`.

- Token hết hạn:
- Gọi `POST /api/auth/refresh` với refresh token.

- Crawler lỗi:
- Kiểm tra Chrome/ChromeDriver tương thích.
- Kiểm tra Kafka đang chạy tại `localhost:9092`.

---

## License

MIT
