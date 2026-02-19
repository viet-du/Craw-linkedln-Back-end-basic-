import json
import os
from kafka import KafkaConsumer
from datetime import datetime
import signal
import sys

# Cấu hình Kafka
KAFKA_BROKER = 'localhost:9092'
TOPIC = 'linkedin-profiles'

# Thư mục dữ liệu chính (cùng với crawler)
DATA_DIR = r"D:\Hoc_tap\linkedlin\Data"
# Thư mục con để lưu backup theo ngày
BACKUP_DIR = os.path.join(DATA_DIR, 'backup_data')
os.makedirs(BACKUP_DIR, exist_ok=True)

# Biến toàn cục để dừng consumer
running = True

def signal_handler(sig, frame):
    global running
    print("\n🛑 Đang dừng consumer...")
    running = False
    sys.exit(0)

signal.signal(signal.SIGINT, signal_handler)

def get_backup_filename():
    """Tạo tên file backup dựa trên ngày hiện tại"""
    today = datetime.now().strftime('%Y-%m-%d')
    return os.path.join(BACKUP_DIR, f'profiles_{today}.json')

def write_to_json(data):
    """Ghi một profile vào file JSON (append an toàn)"""
    filename = get_backup_filename()
    if not os.path.exists(filename):
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump([data], f, ensure_ascii=False, indent=2)
    else:
        with open(filename, 'r+', encoding='utf-8') as f:
            try:
                existing = json.load(f)
            except json.JSONDecodeError:
                existing = []
            existing.append(data)
            f.seek(0)
            json.dump(existing, f, ensure_ascii=False, indent=2)
            f.truncate()

def consume_messages():
    consumer = KafkaConsumer(
        TOPIC,
        bootstrap_servers=KAFKA_BROKER,
        value_deserializer=lambda m: json.loads(m.decode('utf-8')),
        auto_offset_reset='earliest',
        enable_auto_commit=True,
        group_id='linkedin-backup-group',
        max_poll_records=100
    )
    
    print(f"✅ Kafka consumer started. Listening to topic '{TOPIC}'")
    print(f"📁 Backup files will be saved in '{BACKUP_DIR}/'")
    
    batch = []
    last_commit_time = datetime.now()
    
    for message in consumer:
        if not running:
            break
        
        profile = message.value
        batch.append(profile)
        print(f"📥 Received: {profile.get('name', 'Unknown')} (offset {message.offset})")
        
        if len(batch) >= 10 or (datetime.now() - last_commit_time).seconds >= 10:
            for p in batch:
                write_to_json(p)
            print(f"💾 Saved {len(batch)} profiles")
            batch = []
            last_commit_time = datetime.now()
    
    if batch:
        for p in batch:
            write_to_json(p)
        print(f"💾 Saved final {len(batch)} profiles")
    
    consumer.close()
    print("✅ Consumer stopped.")

if __name__ == "__main__":
    try:
        consume_messages()
    except KeyboardInterrupt:
        print("\n🛑 Stopped by user")
    except Exception as e:
        print(f"❌ Error: {e}")