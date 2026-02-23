# scheduler.py
import time
import logging
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from test import run_crawler
from pytz import timezone
# Cấu hình logging
logging.basicConfig(
    filename='scheduler.log',
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    encoding='utf-8'
)

def job():
    """Hàm này sẽ được scheduler gọi"""
    logging.info("Bắt đầu job crawl")
    try:
        # Gọi hàm crawl với các tham số mong muốn
        run_crawler(hours=24, max_profiles=90, pages=4)
    except Exception as e:
        logging.error(f"Lỗi trong job: {e}")
    logging.info("Kết thúc job crawl")

# Tạo scheduler
scheduler = BackgroundScheduler(timezone=timezone("Asia/Ho_Chi_Minh"))

# Thêm job chạy mỗi ngày lúc 2:00 sáng
# Các mốc 8:00, 11:00, 18:00
scheduler.add_job(
    job,
    trigger=CronTrigger(hour='8,11,14,18', minute=0),
    id='daily_crawl_main',
    replace_existing=True,
    max_instances=1,
    coalesce=True,
    misfire_grace_time=300
)


# Nếu muốn chạy mỗi 24 giờ từ lúc khởi động, dùng:
# scheduler.add_job(job, 'interval', hours=24, id='daily_crawl')

# Khởi động
scheduler.start()
logging.info("Scheduler đã khởi động. Nhấn Ctrl+C để dừng.")

try:
    # Giữ chương trình chạy mãi
    while True:
        time.sleep(60)
except KeyboardInterrupt:
    scheduler.shutdown()
    logging.info("Scheduler dừng lại.")