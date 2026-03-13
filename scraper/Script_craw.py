# Import libraries and packages for the project 
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium import webdriver
from bs4 import BeautifulSoup
from time import sleep
import time
import json
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import random
import os
#Thêm kafka
from kafka import KafkaProducer
#Thêm thoát craw đa thread
import signal
import sys
#Thêm threading
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
from selenium.common.exceptions import TimeoutException
import hashlib
import json
from datetime import datetime, timedelta
file_lock = threading.Lock()
output_path = r"D:\Hoc_tap\linkedlin\Data\output.json"
# ===== META DATA CONFIG =====
META_PATH = r"D:\Hoc_tap\linkedlin\Data\crawl_meta.json"  # file lưu thông tin crawl
MAX_AGE_DAYS = 7  # số ngày tối đa trước khi crawl lại
stop_flag = False
# ===== FILTER OPTIONS =====
TIME_FILTERS = {
    '24h': 'r86400',
    'week': 'r604800',
    'month': 'r2592000',
    'all': None
}
def signal_handler(sig, frame):
    global stop_flag
    print("\n🛑 Đang dừng an toàn... Vui lòng chờ hoàn tất profile hiện tại...")
    stop_flag = True

signal.signal(signal.SIGINT, signal_handler)

# Tăng thời gian timeout
WAIT_TIMEOUT = 30
def calculate_checksum(profile_data):
    """Tạo hash từ các trường quan trọng để phát hiện thay đổi."""
    important = {
        'name': profile_data.get('name'),
        'job_title': profile_data.get('job_title'),
        'location': profile_data.get('location'),
        'experience': profile_data.get('experience'),
        'education': profile_data.get('education')
    }
    return hashlib.sha256(json.dumps(important, sort_keys=True).encode()).hexdigest()
# Task 1: Login to Linkedin
print("=== Bắt đầu đăng nhập LinkedIn ===")
print("Lưu ý: Bạn có 60 giây để giải captcha nếu có")

# Task 1.1: Open Chrome and Access Linkedin login site
driver = webdriver.Chrome()
sleep(2)
url = 'https://www.linkedin.com/checkpoint/lg/sign-in-another-account?trk=guest_homepage-basic_nav-header-signin'
driver.get(url)
print('- Finish initializing a driver')
sleep(2)

# Task 1.2: Import username and password
credential_path = r"D:\Hoc_tap\linkedlin\scraper\login.txt"
try:
    with open(credential_path, "r", encoding="utf-8") as credential:
        lines = credential.read().splitlines()
        username = lines[0] if len(lines) > 0 else ""
        password = lines[1] if len(lines) > 1 else ""
    print('- Finish importing the login credentials')
except FileNotFoundError:
    print(f"Lỗi: Không tìm thấy file {credential_path}")
    username = input("Nhập username/email: ")
    password = input("Nhập password: ")

sleep(2)

# Task 1.2: Key in login credentials
try:
    email_field = driver.find_element(By.ID, "username")
    email_field.send_keys(username)
    print('- Finish keying in email')
    sleep(2)

    password_field = driver.find_element(By.NAME, "session_password")
    password_field.send_keys(password)
    print('- Finish keying in password')
    sleep(2)
    
    # Task 1.2: Click the Login button
    signin_field = driver.find_element(By.XPATH, '//*[@id="organic-div"]/form/div[3]/button')
    signin_field.click()
    print('Đã click đăng nhập. Vui lòng giải captcha trong 60 giây nếu có...')
    
    # TĂNG THỜI GIAN CHỜ ĐĂNG NHẬP LÊN 60 GIÂY ĐỂ GIẢI CAPTCHA
    sleep(60)
    
    print('- Finish Task 1: Login to Linkedin')
    #lưu cookie cho các threading sau
    cookies = driver.get_cookies()
    # ===== KAFKA CONFIG =====
    KAFKA_BOOTSTRAP_SERVERS = "localhost:9092"
    KAFKA_TOPIC = "linkedin-profiles"

    producer = KafkaProducer(
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        value_serializer=lambda v: json.dumps(v, ensure_ascii=False).encode("utf-8"),
        retries=5,
        acks='all'
    )

    print("✅ Kafka Producer đã khởi tạo")

except Exception as e:
    print(f"Lỗi đăng nhập: {e}")

# Task 2: Search for the profile we want to crawl + button people
print("\n=== Bắt đầu tìm kiếm profiles ===")
profiles_path = r"D:\Hoc_tap\linkedlin\scraper\profiles.txt"
try:
    with open(profiles_path, "r", encoding="utf-8") as f:
        profiles = [line.strip() for line in f if line.strip()]
except FileNotFoundError:
    print(f"Lỗi: Không tìm thấy file {profiles_path}")
    profiles = ["data scientist"]
# ===== HỎI BỘ LỌC THỜI GIAN =====
time_filter_input = input("\nLọc theo thời gian (nhập số giờ, ví dụ 24 cho 24h, 168 cho 7 ngày, 720 cho 30 ngày, hoặc để trống nếu không lọc): ").strip()
time_param = ""
if time_filter_input:
    try:
        hours = int(time_filter_input)
        seconds = hours * 3600
        time_param = f"&f_TPR=r{seconds}"
        print(f"✅ Sẽ lọc theo {hours} giờ qua")
    except:
        print("⚠️ Không hợp lệ, bỏ qua lọc thời gian")

# ===== LỌC THEO VỊ TRÍ (cố định Việt Nam) =====
location_urn = "104195383"
location_param = f"&geoUrn=%5B%22{location_urn}%22%5D"
print(f"✅ Mặc định lọc theo địa điểm Việt Nam (mã {location_urn})")
# ===== HỎI GIỚI HẠN SỐ LƯỢNG PROFILE =====
max_profiles_input = input("Số lượng profile tối đa muốn crawl (mặc định: tất cả): ").strip()
max_profiles = None
if max_profiles_input:
    try:
        max_profiles = int(max_profiles_input)
    except:
        print("⚠️ Không hợp lệ, sẽ crawl tất cả")
# Sau khi có các biến time_param, location_param, max_profiles
for profile in profiles:
    print(f"\n🔎 Tìm kiếm: {profile}")
    
    # Tạo URL tìm kiếm trực tiếp với các tham số lọc
    search_url = f"https://www.linkedin.com/search/results/people/?keywords={profile.replace(' ', '%20')}&origin=GLOBAL_SEARCH_HEADER{time_param}{location_param}"
    driver.get(search_url)
    time.sleep(5)  # Chờ trang load

    # Scroll để load thêm kết quả
    for i in range(3):
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(2)

    # Đếm số lượng kết quả (tùy chọn)
    soup = BeautifulSoup(driver.page_source, "html.parser")
    profile_cards = soup.find_all("div", {"class": ["search-result", "reusable-search__result-container", "entity-result"]})
    print(f"  📊 Tìm thấy {len(profile_cards)} profile cards")

    time.sleep(3)

print("\n=== Hoàn thành Task 2: Tìm kiếm profiles ===")

# Task 3: Scrape the URLs of the profiles
print("\n=== Bắt đầu thu thập URLs ===")

def GetURL():
    page_source = BeautifulSoup(driver.page_source, "html.parser")
    urls = []
    
    # Tìm tất cả các thẻ có chứa link profile
    profile_links = page_source.find_all("a", href=lambda x: x and "/in/" in x)
    
    for link in profile_links:
        href = link.get('href', '')
        if '/in/' in href:
            clean_url = href.split('?')[0]
            if not clean_url.startswith('http'):
                clean_url = 'https://www.linkedin.com' + clean_url
            
            if clean_url not in urls and 'linkedin.com/in/' in clean_url:
                urls.append(clean_url)
    
    print(f"  Tìm thấy {len(urls)} URLs trong trang hiện tại")
    return urls

try:
    input_page = int(input('\nBạn muốn crawl bao nhiêu trang? '))
except:
    input_page = 2

URLs_all_page = []

for page in range(input_page):
    print(f"\nĐang xử lý trang {page + 1}/{input_page}")
    URLs_one_page = GetURL()
    URLs_all_page.extend(URLs_one_page)
    
    print(f"  Đã thu thập {len(URLs_one_page)} URLs từ trang này")
    print(f"  Tổng URLs đã thu thập: {len(URLs_all_page)}")
    
    # Scroll để load thêm
    sleep(3)
    driver.execute_script('window.scrollTo(0, document.body.scrollHeight);')
    sleep(3)
    
    # ĐỢI VÀ TÌM NÚT NEXT ĐỂ CHUYỂN TRANG
    if page < input_page - 1:
        print("  Đang tìm nút Next để chuyển trang...")
        next_clicked = False
        
        # PHƯƠNG PHÁP 1: Tìm bằng data-testid (THEO HTML)
        try:
            next_button = driver.find_element(By.CSS_SELECTOR, "button[data-testid='pagination-controls-next-button-visible']")
            driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", next_button)
            sleep(2)
            
            # Kiểm tra xem nút có bị disabled không
            if not next_button.get_attribute("disabled"):
                driver.execute_script("arguments[0].click();", next_button)
                next_clicked = True
                print("  Đã nhấn nút Next bằng data-testid")
            else:
                print("  Nút Next bị disabled, không có trang tiếp theo")
                break
        except Exception as e:
            print(f"  Không tìm thấy nút bằng data-testid: {e}")
        
        # PHƯƠNG PHÁP 2: Tìm bằng text "Tiếp theo" (fallback)
        if not next_clicked:
            try:
                next_button = driver.find_element(By.XPATH, "//button[contains(., 'Tiếp theo')]")
                driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", next_button)
                sleep(2)
                
                if not next_button.get_attribute("disabled"):
                    driver.execute_script("arguments[0].click();", next_button)
                    next_clicked = True
                    print("  Đã nhấn nút Next bằng text 'Tiếp theo'")
                else:
                    print("  Nút Next bị disabled")
                    break
            except:
                pass
        
        # PHƯƠNG PHÁP 3: Tìm bằng aria-label (fallback)
        if not next_clicked:
            try:
                next_button = driver.find_element(By.XPATH, "//button[@aria-label='Next']")
                driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", next_button)
                sleep(2)
                
                if not next_button.get_attribute("disabled"):
                    driver.execute_script("arguments[0].click();", next_button)
                    next_clicked = True
                    print("  Đã nhấn nút Next bằng aria-label")
                else:
                    print("  Nút Next bị disabled")
                    break
            except:
                pass
        
        if not next_clicked:
            print("  KHÔNG tìm thấy nút Next. Dừng thu thập.")
            break
        
        # Đợi trang mới load hoàn toàn
        print("  Đang chờ trang mới load...")
        time.sleep(5)
        
        # Chờ cho đến khi có kết quả mới xuất hiện
        try:
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "div.search-results-container, div.reusable-search__entity-result-list"))
            )
            print("  Trang mới đã load xong")
        except:
            print("  Chờ trang mới load timeout, tiếp tục...")

URLs_all_page = list(set(URLs_all_page))

# Kiểm tra file output hiện có để bỏ qua những URL đã crawl trước đó
# ===== ĐỌC METADATA =====
meta = {}
if os.path.exists(META_PATH):
    try:
        with open(META_PATH, 'r', encoding='utf-8') as f:
            meta = json.load(f)
    except:
        meta = {}

# Kết hợp metadata với output.json (nếu có)
existing_urls = set()
if os.path.exists(output_path):
    with open(output_path, 'r', encoding='utf-8') as ef:
        try:
            existing_data = json.load(ef)
            for item in existing_data:
                u = item.get('url') or item.get('linkedin_url')
                if u:
                    u_clean = u.split('?')[0]
                    existing_urls.add(u_clean)
                    # Nếu chưa có metadata, tạo mới
                    if u_clean not in meta:
                        meta[u_clean] = {
                            'last_crawled': None,
                            'checksum': None
                        }
        except:
            pass

# Lọc URL mới (chưa từng crawl) và URL cũ cần cập nhật
new_urls = []          # chưa có trong meta
update_urls = []       # đã có nhưng quá hạn hoặc cần cập nhật
now = datetime.now()

# Giới hạn số lượng URL nếu người dùng yêu cầu (có thể đặt ở đây hoặc sau)
if max_profiles and len(URLs_all_page) > max_profiles:
    URLs_all_page = URLs_all_page[:max_profiles]
    print(f"🔍 Giới hạn {max_profiles} URLs sẽ xử lý")

for u in URLs_all_page:
    u_clean = u.split('?')[0]
    if u_clean not in meta:
        new_urls.append(u)
    else:
        last = meta[u_clean].get('last_crawled')
        if last:
            last_date = datetime.fromisoformat(last)
            if now - last_date > timedelta(days=MAX_AGE_DAYS):
                update_urls.append(u)   # đã quá hạn, cần crawl lại
        else:
            update_urls.append(u)       # chưa có thời gian (dữ liệu cũ)

print(f"✅ URL mới: {len(new_urls)}")
print(f"🔄 URL cần cập nhật (cũ hơn {MAX_AGE_DAYS} ngày): {len(update_urls)}")

crawl_urls = new_urls + update_urls
print(f"📌 Tổng số URL sẽ crawl: {len(crawl_urls)}")

if not crawl_urls:
    print("🚫 Không có URL nào cần crawl. Kết thúc.")
    driver.quit()
    sys.exit(0)

print("\n5 URLs đầu tiên sẽ crawl:")
for i, url in enumerate(crawl_urls[:5]):
    print(f"  {i+1}. {url}")


def crawl_profile(linkedin_URL, idx, total_profiles):
    global stop_flag
    
    if stop_flag:
        return None
    options = webdriver.ChromeOptions()

# Headless mode
    options.add_argument("--headless=new")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-gpu")

    # Giả lập kích thước window ổn định
    options.add_argument("--window-size=1280,900")
    #Giảm bị detect automation.
    options.add_argument("--disable-extensions")
    options.add_argument("--disable-blink-features=AutomationControlled")


    thread_driver = webdriver.Chrome(options=options)



    # Gắn lại cookies để khỏi login lại
    thread_driver.get("https://www.linkedin.com")
    for cookie in cookies:
        thread_driver.add_cookie(cookie)

    try:
        print(f"\n[{idx}/{total_profiles}] Đang xử lý: {linkedin_URL}")

        thread_driver.set_page_load_timeout(60)
        thread_driver.get(linkedin_URL)

        WebDriverWait(thread_driver, WAIT_TIMEOUT).until(
            EC.presence_of_element_located((By.TAG_NAME, "body"))
        )

        time.sleep(random.uniform(5, 8))  # tăng delay

        # Scroll chậm hơn
        for i in range(2):
            thread_driver.execute_script(
                "window.scrollTo(0, document.body.scrollHeight);"
            )
            time.sleep(random.uniform(1.5, 2.5))


        soup = BeautifulSoup(thread_driver.page_source, "html.parser")
        
        # CẤU TRÚC DỮ LIỆU
        profile_data = {
            "name": None,
            "location": None,
            "job_title": None,
            "education": [],
            "experience": [],
            "total_experience_count": 0,
            "url": linkedin_URL
        }
        checksum = calculate_checksum(profile_data)
        profile_data['_checksum'] = checksum
        url_clean = linkedin_URL.split('?')[0]
        old_checksum = meta.get(url_clean, {}).get('checksum')
        if old_checksum and old_checksum != checksum:
            print(f"    🔄 Checksum thay đổi so với lần trước")
        # 1. LẤY TÊN
        try:
            name_element = soup.find("h1", {"class": lambda x: x and any(cls in str(x) for cls in ["text-heading-xlarge", "t-24", "inline"])})
            if name_element:
                profile_data["name"] = name_element.get_text(strip=True)
        except Exception as e:
            print(f"    Lỗi khi lấy tên: {e}")
        
        # 2. LẤY CHỨC VỤ HIỆN TẠI
        try:
            job_element = soup.find("div", {"class": lambda x: x and any(cls in str(x) for cls in ["text-body-medium", "break-words"])})
            if job_element:
                profile_data["job_title"] = job_element.get_text(strip=True)
        except Exception as e:
            print(f"    Lỗi khi lấy chức vụ: {e}")
        
        # 3. LẤY ĐỊA ĐIỂM (LOCATION)
        try:
            location_element = soup.find("span", {"class": lambda x: x and "text-body-small" in str(x) and "t-black--light" in str(x) and "break-words" in str(x)})
            if location_element:
                profile_data["location"] = location_element.get_text(strip=True)
        except Exception as e:
            print(f"    Lỗi khi lấy địa điểm: {e}")
        
        # 4. LẤY KINH NGHIỆM (EXPERIENCE) - CÁCH TIẾP CẬN MỚI
        print("    Đang lấy thông tin kinh nghiệm...")
        try:
            # Tìm tất cả các section và lọc ra section kinh nghiệm
            all_sections = soup.find_all("section")
            
            for section in all_sections:
                # Kiểm tra tiêu đề của section
                section_title = None
                h2_tag = section.find("h2")
                if h2_tag:
                    section_title = h2_tag.get_text(strip=True).lower()
                
                # Kiểm tra nếu là section kinh nghiệm
                if section_title and ("experience" in section_title or "kinh nghiệm" in section_title or "work" in section_title):
                    print(f"    Tìm thấy section kinh nghiệm: {section_title}")
                    
                    # Tìm tất cả các mục trong section này
                    # Thử nhiều cấu trúc khác nhau
                    exp_items = []
                    
                    # Cách 1: Tìm các li items
                    exp_items = section.find_all("li", {"class": lambda x: x and any(cls in str(x) for cls in ["artdeco-list__item", "pvs-list__item"])})
                    
                    # Cách 2: Tìm các div có cấu trúc cụ thể
                    if not exp_items:
                        exp_items = section.find_all("div", {"class": lambda x: x and "display-flex flex-column" in str(x)})
                    
                    # Cách 3: Tìm tất cả các div và lọc
                    if not exp_items:
                        all_divs = section.find_all("div")
                        for div in all_divs:
                            # Kiểm tra div có chứa thông tin công việc không
                            has_position = div.find("div", {"class": lambda x: x and "hoverable-link-text" in str(x) and "t-bold" in str(x)})
                            has_company = div.find("span", {"class": lambda x: x and "t-14" in str(x) and "t-normal" in str(x)})
                            if has_position or has_company:
                                exp_items.append(div)
                    
                    print(f"    Tìm thấy {len(exp_items)} mục kinh nghiệm")
                    
                    for item in exp_items:
                        # Bỏ qua các item quá nhỏ hoặc không có thông tin
                        item_text = item.get_text(strip=True)
                        if len(item_text) < 10:
                            continue
                        
                        exp_data = {
                            "position": None,
                            "company": None,
                            "employment_type": None,
                            "duration": None
                        }
                        
                        # Tìm chức danh (position)
                        try:
                            # Tìm trong thẻ span với aria-hidden="true" trong div có class hoverable-link-text t-bold
                            pos_div = item.find("div", {"class": lambda x: x and "hoverable-link-text" in str(x) and "t-bold" in str(x)})
                            if pos_div:
                                pos_span = pos_div.find("span", {"aria-hidden": "true"})
                                if pos_span:
                                    pos_text = pos_span.get_text(strip=True)
                                    if pos_text:
                                        exp_data["position"] = pos_text
                        except:
                            pass
                        
                        # Tìm công ty và loại hình làm việc
                        try:
                            # Tìm span có class t-14 t-normal
                            company_span = item.find("span", {"class": lambda x: x and "t-14" in str(x) and "t-normal" in str(x)})
                            if company_span:
                                company_text = company_span.get_text(strip=True)
                                if company_text and "·" in company_text:
                                    parts = company_text.split("·")
                                    if len(parts) >= 2:
                                        exp_data["company"] = parts[0].strip()
                                        exp_data["employment_type"] = parts[1].strip()
                                    else:
                                        exp_data["company"] = company_text
                                elif company_text:
                                    exp_data["company"] = company_text
                        except:
                            pass
                        
                        # Tìm thời gian
                        try:
                            # Tìm span có class pvs-entity__caption-wrapper
                            time_span = item.find("span", {"class": lambda x: x and "pvs-entity__caption-wrapper" in str(x)})
                            if time_span:
                                time_text = time_span.get_text(strip=True)
                                if time_text:
                                    exp_data["duration"] = time_text
                        except:
                            pass
                        
                        # Kiểm tra xem đây có thực sự là kinh nghiệm không
                        # Loại bỏ nếu:
                        # 1. Có chứa từ khóa không phải kinh nghiệm
                        # 2. Là thông tin trường học
                        # 3. Là thông tin chứng chỉ
                        
                        should_add = True
                        skip_keywords = ["university", "college", "school", "academy", "institute", 
                                        "certified", "certification", "license", "chứng chỉ", "bằng cấp",
                                        "follower", "following", "theo dõi", "người theo dõi", "thành viên",
                                        "member", "connect", "kết nối"]
                        
                        # Kiểm tra position
                        if exp_data["position"]:
                            pos_lower = exp_data["position"].lower()
                            for keyword in skip_keywords:
                                if keyword in pos_lower:
                                    should_add = False
                                    break
                        
                        # Kiểm tra company
                        if exp_data["company"] and should_add:
                            company_lower = exp_data["company"].lower()
                            for keyword in skip_keywords:
                                if keyword in company_lower:
                                    should_add = False
                                    break
                        
                        # Kiểm tra xem có phải là thông tin học vấn không
                        if exp_data["position"] and any(word in exp_data["position"].lower() for word in ["bachelor", "master", "phd", "degree", "student"]):
                            should_add = False
                        
                        # Chỉ thêm nếu có ít nhất position hoặc company và không bị skip
                        if should_add and (exp_data["position"] or exp_data["company"]):
                            # Loại bỏ các mục trùng lặp hoặc không rõ ràng
                            if exp_data["position"] and exp_data["company"]:
                                # Kiểm tra xem có phải là thông tin hợp lệ không
                                if len(exp_data["position"]) > 2 and len(exp_data["company"]) > 2:
                                    profile_data["experience"].append(exp_data)
        
        except Exception as e:
            print(f"    Lỗi khi lấy kinh nghiệm: {e}")
        
        # 5. LẤY HỌC VẤN (EDUCATION) - CÁCH TIẾP CẬN MỚI
        print("    Đang lấy thông tin học vấn...")
        try:
            # Tìm tất cả các section và lọc ra section học vấn
            all_sections = soup.find_all("section")
            
            for section in all_sections:
                # Kiểm tra tiêu đề của section
                section_title = None
                h2_tag = section.find("h2")
                if h2_tag:
                    section_title = h2_tag.get_text(strip=True).lower()
                
                # Kiểm tra nếu là section học vấn
                if section_title and ("education" in section_title or "học vấn" in section_title or "background" in section_title):
                    print(f"    Tìm thấy section học vấn: {section_title}")
                    
                    # Tìm tất cả các mục trong section này
                    edu_items = []
                    
                    # Cách 1: Tìm các li items
                    edu_items = section.find_all("li", {"class": lambda x: x and any(cls in str(x) for cls in ["artdeco-list__item", "pvs-list__item"])})
                    
                    # Cách 2: Tìm các div có cấu trúc cụ thể
                    if not edu_items:
                        edu_items = section.find_all("div", {"class": lambda x: x and "display-flex flex-column" in str(x)})
                    
                    # Cách 3: Tìm các a tag
                    if not edu_items:
                        edu_items = section.find_all("a", {"class": lambda x: x and "optional-action-target-wrapper" in str(x)})
                    
                    print(f"    Tìm thấy {len(edu_items)} mục học vấn")
                    
                    for item in edu_items:
                        # Bỏ qua các item quá nhỏ
                        item_text = item.get_text(strip=True)
                        if len(item_text) < 10:
                            continue
                        
                        edu_data = {
                            "school": None,
                            "degree": None,
                            "duration": None
                        }
                        
                        # Tìm tên trường
                        try:
                            # Tìm trong thẻ span với aria-hidden="true" trong div có class hoverable-link-text t-bold
                            school_div = item.find("div", {"class": lambda x: x and "hoverable-link-text" in str(x) and "t-bold" in str(x)})
                            if school_div:
                                school_span = school_div.find("span", {"aria-hidden": "true"})
                                if school_span:
                                    school_text = school_span.get_text(strip=True)
                                    if school_text:
                                        edu_data["school"] = school_text
                        except:
                            pass
                        
                        # Tìm ngành học
                        try:
                            # Tìm span có class t-14 t-normal
                            degree_span = item.find("span", {"class": lambda x: x and "t-14" in str(x) and "t-normal" in str(x)})
                            if degree_span:
                                degree_text = degree_span.get_text(strip=True)
                                if degree_text:
                                    edu_data["degree"] = degree_text
                        except:
                            pass
                        
                        # Tìm thời gian
                        try:
                            # Tìm span có class pvs-entity__caption-wrapper
                            time_span = item.find("span", {"class": lambda x: x and "pvs-entity__caption-wrapper" in str(x)})
                            if time_span:
                                time_text = time_span.get_text(strip=True)
                                if time_text:
                                    edu_data["duration"] = time_text
                        except:
                            pass
                        
                        # Kiểm tra xem đây có thực sự là học vấn không
                        # Loại bỏ nếu:
                        # 1. Là thông tin công ty
                        # 2. Là thông tin kinh nghiệm
                        # 3. Là thông tin chứng chỉ
                        
                        should_add = True
                        
                        # Kiểm tra school
                        if edu_data["school"]:
                            school_lower = edu_data["school"].lower()
                            # Loại bỏ nếu là tên công ty hoặc thông tin không phải trường học
                            company_keywords = ["gmbh", "ltd", "inc", "corp", "company", "technologies", 
                                              "software", "solution", "group", "holding", "consulting"]
                            non_edu_keywords = ["follower", "following", "theo dõi", "người theo dõi", 
                                              "thành viên", "member", "connect", "kết nối", "certified"]
                            
                            for keyword in company_keywords + non_edu_keywords:
                                if keyword in school_lower:
                                    should_add = False
                                    break
                        
                        # Kiểm tra degree
                        if edu_data["degree"] and should_add:
                            degree_lower = edu_data["degree"].lower()
                            # Loại bỏ nếu là loại hình làm việc
                            work_keywords = ["full-time", "part-time", "internship", "contract", "temporary", 
                                           "freelance", "remote", "onsite"]
                            for keyword in work_keywords:
                                if keyword in degree_lower:
                                    should_add = False
                                    break
                        
                        # Chỉ thêm nếu có school và không bị skip
                        if should_add and edu_data["school"]:
                            # Loại bỏ các mục trùng lặp hoặc không rõ ràng
                            if len(edu_data["school"]) > 2:
                                # Kiểm tra xem school có chứa từ khóa trường học không
                                edu_keywords = ["university", "college", "school", "academy", "institute", 
                                              "đại học", "cao đẳng", "trường", "học viện"]
                                has_edu_keyword = any(keyword in edu_data["school"].lower() for keyword in edu_keywords)
                                
                                # Nếu không có từ khóa trường học nhưng vẫn có thể là tên trường ngắn
                                if has_edu_keyword or len(edu_data["school"].split()) <= 5:
                                    profile_data["education"].append(edu_data)
        
        except Exception as e:
            print(f"    Lỗi khi lấy học vấn: {e}")
        
        # 6. LỌC LẠI DỮ LIỆU ĐỂ LOẠI BỎ CÁC MỤC KHÔNG PHÙ HỢP
        # Lọc education: loại bỏ các mục có chứa số lượng người theo dõi, thành viên, v.v.
        filtered_education = []
        for edu in profile_data["education"]:
            school = edu.get("school", "")
            degree = edu.get("degree", "")
            
            # Loại bỏ nếu chứa thông tin không phù hợp
            skip_patterns = [
                "người theo dõi", "thành viên", "follower", "member", "theo dõi",
                "kết nối", "connect", "đăng", "newsletter", "wrap-up"
            ]
            
            should_skip = False
            for pattern in skip_patterns:
                if school and pattern in school.lower():
                    should_skip = True
                    break
                if degree and pattern in degree.lower():
                    should_skip = True
                    break
            
            # Loại bỏ nếu là số lượng lớn (có chứa dấu chấm hoặc dấu phẩy trong số)
            if school and any(char.isdigit() for char in school):
                # Kiểm tra xem có phải là số lượng không
                if "." in school or "," in school or any(word in school.lower() for word in ["k", "m", "triệu", "tỷ"]):
                    should_skip = True
            
            if not should_skip:
                filtered_education.append(edu)
        
        profile_data["education"] = filtered_education
        
        # Lọc experience: loại bỏ các mục không phải kinh nghiệm
        filtered_experience = []
        for exp in profile_data["experience"]:
            position = exp.get("position", "")
            company = exp.get("company", "")
            
            # Loại bỏ nếu là thông tin học vấn
            edu_keywords = ["university", "college", "school", "academy", "institute", 
                          "bachelor", "master", "phd", "student", "candidate"]
            
            should_skip = False
            for keyword in edu_keywords:
                if position and keyword in position.lower():
                    should_skip = True
                    break
                if company and keyword in company.lower():
                    should_skip = True
                    break
            
            # Loại bỏ nếu có chứa thời gian trong position hoặc company
            time_keywords = ["thg", "năm", "tháng", "hiện tại", "present", "đến", "từ"]
            for keyword in time_keywords:
                if position and keyword in position.lower():
                    should_skip = True
                    break
                if company and keyword in company.lower():
                    should_skip = True
                    break
            
            if not should_skip:
                filtered_experience.append(exp)
        
        profile_data["experience"] = filtered_experience
        
        # CẬP NHẬT tổng số kinh nghiệm
        profile_data["total_experience_count"] = len(profile_data["experience"])
        
        
        # Hiển thị thông tin đã lấy được
        print(f"    Đã lấy được:")
        print(f"      - Tên: {profile_data['name']}")
        print(f"      - Chức vụ: {profile_data['job_title'][:50] if profile_data['job_title'] else 'N/A'}...")
        print(f"      - Địa điểm: {profile_data['location']}")
        print(f"      - Số trường học: {len(profile_data['education'])}")
        print(f"      - Số kinh nghiệm: {profile_data['total_experience_count']} công ty")
        
        # Hiển thị chi tiết học vấn và kinh nghiệm
        if profile_data['education']:
            print(f"      - Chi tiết học vấn:")
            for i, edu in enumerate(profile_data['education'][:2], 1):
                print(f"        {i}. Trường: {edu.get('school', 'N/A')}")
                print(f"           Ngành: {edu.get('degree', 'N/A')}")
                print(f"           Thời gian: {edu.get('duration', 'N/A')}")
        
        if profile_data['experience']:
            print(f"      - Chi tiết kinh nghiệm ({profile_data['total_experience_count']} công ty):")
            for i, exp in enumerate(profile_data['experience'][:2], 1):
                print(f"        {i}. Vị trí: {exp.get('position', 'N/A')}")
                print(f"           Công ty: {exp.get('company', 'N/A')}")
                print(f"           Loại hình: {exp.get('employment_type', 'N/A')}")
                print(f"           Thời gian: {exp.get('duration', 'N/A')}")

        # ===== GỬI KAFKA =====
        if 'producer' in globals():
            producer.send(KAFKA_TOPIC, value=profile_data)
        print("    📤 Đã gửi Kafka")

        time.sleep(random.uniform(4,6))  # delay mạnh hơn

        return profile_data
    except Exception as e:
        print(f"❌ Lỗi {linkedin_URL}: {e}")
        return None

    finally:
        try:
            thread_driver.quit()
        except Exception:
            pass
# Task 4: Scrape the data của từng profile
print(f"\n=== Bắt đầu crawl {len(crawl_urls)} profiles với 3 threads ===")
profiles_data = []
total_profiles = len(crawl_urls)

with ThreadPoolExecutor(max_workers=3) as executor:
    futures = []
    for idx, url in enumerate(crawl_urls, 1):
        if stop_flag:
            break
        futures.append(executor.submit(crawl_profile, url, idx, total_profiles))
        time.sleep(random.uniform(2, 4))

    for future in as_completed(futures):
        try:
            result = future.result()
            if result:
                profiles_data.append(result)
                # Cập nhật metadata
                url_clean = result['url'].split('?')[0]
                meta[url_clean] = {
                    'last_crawled': datetime.now().isoformat(),
                    'checksum': result.get('_checksum', '')
                }
                with file_lock:
                    with open(META_PATH, 'w', encoding='utf-8') as f:
                        json.dump(meta, f, indent=4)
        except Exception as e:
            print(f"Thread error: {e}")
            continue

# EXPORT JSON FINAL
output_path = r"D:\Hoc_tap\linkedlin\Data\output.json"
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(profiles_data, f, ensure_ascii=False, indent=4)

print(f"\n=== HOÀN THÀNH ===")
print(f"Đã thu thập dữ liệu của {len(profiles_data)} profiles")
print(f"Dữ liệu đã được lưu vào: {output_path}")

# Hiển thị mẫu dữ liệu
if profiles_data:
    print("\n=== MẪU DỮ LIỆU ĐÃ THU THẬP ===")
    sample = profiles_data[0]
    print(f"Tên: {sample.get('name', 'N/A')}")
    print(f"Địa điểm: {sample.get('location', 'N/A')}")
    print(f"Chức vụ: {sample.get('job_title', 'N/A')}")
    print(f"Tổng số kinh nghiệm: {sample.get('total_experience_count', 0)} công ty")
    
    if sample.get('experience'):
        print(f"\nKinh nghiệm ({len(sample['experience'])} công ty):")
        for i, exp in enumerate(sample['experience'][:5], 1):
            print(f"  {i}. Vị trí: {exp.get('position', 'N/A')}")
            print(f"     Công ty: {exp.get('company', 'N/A')}")
            print(f"     Loại hình: {exp.get('employment_type', 'N/A')}")
            print(f"     Thời gian: {exp.get('duration', 'N/A')}")
    
    if sample.get('education'):
        print(f"\nHọc vấn ({len(sample['education'])} trường):")
        for i, edu in enumerate(sample['education'][:3], 1):
            print(f"  {i}. Trường: {edu.get('school', 'N/A')}")
            print(f"     Ngành học: {edu.get('degree', 'N/A')}")
            print(f"     Thời gian: {edu.get('duration', 'N/A')}")

# Đóng trình duyệt
print("\nĐang đóng trình duyệt...")
if 'producer' in globals():
    print("Đang đóng Kafka producer...")
    producer.flush(timeout=5)
    producer.close()
driver.quit()
# ===== HƯỚNG DẪN CRON JOB =====
# Để chạy script tự động hàng ngày, dùng Task Scheduler (Windows) hoặc crontab (Linux)
# Ví dụ trên Windows:
# - Mở Task Scheduler, tạo task mới, trigger hàng ngày, action: python D:\Hoc_tap\linkedlin\scraper\Script_craw.py