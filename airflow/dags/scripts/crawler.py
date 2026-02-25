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
from kafka import KafkaProducer
import signal
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
from selenium.common.exceptions import TimeoutException
import hashlib
from datetime import datetime, timedelta
import argparse
from pytz import timezone
from datetime import datetime
# ========== Cáº¤U HÃŒNH & BIáº¾N TOÃ€N Cá»¤C ==========
file_lock = threading.Lock()
output_path = os.getenv("LINKEDIN_OUTPUT_PATH", "/opt/airflow/data/output.json")
META_PATH = os.getenv("LINKEDIN_META_PATH", "/opt/airflow/data/crawl_meta.json")
MAX_AGE_DAYS = 30
stop_flag = False
WAIT_TIMEOUT = 30

def signal_handler(sig, frame):
    global stop_flag
    print("\nðŸ›‘ Äang dá»«ng an toÃ n... Vui lÃ²ng chá» hoÃ n táº¥t profile hiá»‡n táº¡i...")
    stop_flag = True

signal.signal(signal.SIGINT, signal_handler)
def create_driver(options=None):
    remote_url = os.getenv("SELENIUM_REMOTE_URL")
    if remote_url:
        if options is None:
            options = webdriver.ChromeOptions()
        return webdriver.Remote(command_executor=remote_url, options=options)
    if options is None:
        return webdriver.Chrome()
    return webdriver.Chrome(options=options)

def calculate_checksum(profile_data):
    important = {
        'name': profile_data.get('name'),
        'job_title': profile_data.get('job_title'),
        'location': profile_data.get('location'),
        'experience': profile_data.get('experience'),
        'education': profile_data.get('education')
    }
    return hashlib.sha256(json.dumps(important, sort_keys=True).encode()).hexdigest()

def run_crawler(hours=None, max_profiles=None, pages=None):
    """
    HÃ m chÃ­nh thá»±c hiá»‡n quy trÃ¬nh crawl LinkedIn.
    CÃ¡c tham sá»‘:
        hours: sá»‘ giá» lá»c (int hoáº·c None)
        max_profiles: giá»›i háº¡n profile (int hoáº·c None)
        pages: sá»‘ trang crawl (int ho None)
    """
    global stop_flag

    # ===== Xá»¬ LÃ THAM Sá» =====
    time_param = ""
    if hours:
        time_param = f"&f_TPR=r{hours*3600}"
        print(f"âœ… Sáº½ lá»c theo {hours} giá» qua")

    location_urn = "104195383"
    location_param = f"&geoUrn=%5B%22{location_urn}%22%5D"
    print(f"âœ… Máº·c Ä‘á»‹nh lá»c theo Ä‘á»‹a Ä‘iá»ƒm Viá»‡t Nam (mÃ£ {location_urn})")

    # ===== ÄÄ‚NG NHáº¬P =====
    print("=== Báº¯t Ä‘áº§u Ä‘Äƒng nháº­p LinkedIn ===")
    print("LÆ°u Ã½: Báº¡n cÃ³ 60 giÃ¢y Ä‘á»ƒ giáº£i captcha náº¿u cÃ³")

    driver = create_driver()
    driver.get('https://www.linkedin.com/checkpoint/lg/sign-in-another-account?trk=guest_homepage-basic_nav-header-signin')
    sleep(2)

    credential_path = os.getenv("LINKEDIN_LOGIN_PATH", "/opt/airflow/dags/scripts/login.txt")
    try:
        with open(credential_path, "r", encoding="utf-8") as f:
            lines = f.read().splitlines()
            username = lines[0] if len(lines) > 0 else ""
            password = lines[1] if len(lines) > 1 else ""
        print('- Finish importing the login credentials')
    except FileNotFoundError:
        print(f"Lá»—i: KhÃ´ng tÃ¬m tháº¥y file {credential_path}")
        username = input("Nháº­p username/email: ")
        password = input("Nháº­p password: ")

    sleep(2)

    try:
        email_field = driver.find_element(By.ID, "username")
        email_field.send_keys(username)
        sleep(2)

        password_field = driver.find_element(By.NAME, "session_password")
        password_field.send_keys(password)
        sleep(2)

        signin_field = driver.find_element(By.XPATH, '//*[@id="organic-div"]/form/div[3]/button')
        signin_field.click()
        print('ÄÃ£ click Ä‘Äƒng nháº­p. Báº¡n cÃ³ 60 giÃ¢y Ä‘á»ƒ giáº£i captcha...')
        sleep(60)

        print('- Finish Task 1: Login to Linkedin')
        cookies = driver.get_cookies()

        # Kafka producer
        KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BROKER", "kafka:29092")
        KAFKA_TOPIC = "linkedin-profiles"
        producer = KafkaProducer(
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            value_serializer=lambda v: json.dumps(v, ensure_ascii=False).encode("utf-8"),
            retries=5,
            acks='all'
        )
        print("âœ… Kafka Producer Ä‘Ã£ khá»Ÿi táº¡o")

    except Exception as e:
        print(f"Lá»—i Ä‘Äƒng nháº­p: {e}")
        driver.quit()
        return

    # ===== Äá»ŒC DANH SÃCH Tá»ª KHÃ“A =====
    profiles_path = os.getenv("LINKEDIN_PROFILES_PATH", "/opt/airflow/dags/scripts/profiles.txt")
    try:
        with open(profiles_path, "r", encoding="utf-8") as f:
            all_profiles = [line.strip() for line in f if line.strip()]
    except FileNotFoundError:
        print(f"Lá»—i: KhÃ´ng tÃ¬m tháº¥y file {profiles_path}")
        all_profiles = ["data scientist"]

    # Chá»n keyword dá»±a trÃªn giá» hiá»‡n táº¡i
    current_hour = datetime.now(timezone('Asia/Ho_Chi_Minh')).hour
# Map giá» sang index (0-based)
    hour_to_index = {8: 0, 11: 1, 14: 2, 18: 3}
    if current_hour in hour_to_index and len(all_profiles) > hour_to_index[current_hour]:
        profiles = [all_profiles[hour_to_index[current_hour]]]
        print(f"ðŸ”¹ Giá» {current_hour}: chá»‰ crawl tá»« khÃ³a '{profiles[0]}'")
    else:
        print(f"â­ï¸ Giá» {current_hour} khÃ´ng náº±m trong lá»‹ch crawl, thoÃ¡t.")
        driver.quit()
        producer.close()
        return
    # ===== TÃŒM KIáº¾M CHO Tá»ªNG Tá»ª KHÃ“A =====
    URLs_all_page = []
    for profile in profiles:
        print(f"\nðŸ”Ž TÃ¬m kiáº¿m: {profile}")
        search_url = f"https://www.linkedin.com/search/results/people/?keywords={profile.replace(' ', '%20')}&origin=GLOBAL_SEARCH_HEADER{time_param}{location_param}"
        driver.get(search_url)
        time.sleep(5)

        for i in range(3):
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(2)

        soup = BeautifulSoup(driver.page_source, "html.parser")
        profile_cards = soup.find_all("div", {"class": ["search-result", "reusable-search__result-container", "entity-result"]})
        print(f"  ðŸ“Š TÃ¬m tháº¥y {len(profile_cards)} profile cards")
        time.sleep(3)

    print("\n=== HoÃ n thÃ nh Task 2: TÃ¬m kiáº¿m profiles ===")

    # ===== THU THáº¬P URLs =====
    print("\n=== Báº¯t Ä‘áº§u thu tháº­p URLs ===")

    def GetURL():
        soup = BeautifulSoup(driver.page_source, "html.parser")
        urls = []
        for link in soup.find_all("a", href=lambda x: x and "/in/" in x):
            href = link.get('href')
            if '/in/' in href:
                clean = href.split('?')[0]
                if not clean.startswith('http'):
                    clean = 'https://www.linkedin.com' + clean
                if clean not in urls and 'linkedin.com/in/' in clean:
                    urls.append(clean)
        return urls

    # XÃ¡c Ä‘á»‹nh sá»‘ trang
    if pages is None:
        try:
            pages = int(input('\nBáº¡n muá»‘n crawl bao nhiÃªu trang? '))
        except:
            pages = 2
    else:
        print(f"âœ… Sá»­ dá»¥ng tham sá»‘: {pages} trang")

    URLs_all_page = []
    for page in range(pages):
        print(f"\nÄang xá»­ lÃ½ trang {page+1}/{pages}")
        page_urls = GetURL()
        URLs_all_page.extend(page_urls)
        URLs_all_page = list(set(URLs_all_page))
        print(f"  ÄÃ£ thu tháº­p {len(page_urls)} URLs, tá»•ng {len(URLs_all_page)}")

        if page < pages - 1:
            try:
                next_btn = driver.find_element(By.CSS_SELECTOR, "button[data-testid='pagination-controls-next-button-visible']")
                if not next_btn.get_attribute("disabled"):
                    next_btn.click()
                    time.sleep(5)
                else:
                    break
            except:
                break

    # ===== Lá»ŒC URL Dá»°A TRÃŠN METADATA =====
    meta = {}
    if os.path.exists(META_PATH):
        try:
            with open(META_PATH, 'r', encoding='utf-8') as f:
                meta = json.load(f)
        except:
            meta = {}

    existing_urls = set()
    if os.path.exists(output_path):
        with open(output_path, 'r', encoding='utf-8') as f:
            try:
                existing_data = json.load(f)
                for item in existing_data:
                    u = item.get('url') or item.get('linkedin_url')
                    if u:
                        u_clean = u.split('?')[0]
                        existing_urls.add(u_clean)
                        if u_clean not in meta:
                            meta[u_clean] = {'last_crawled': None, 'checksum': None}
            except:
                pass

    new_urls = []
    update_urls = []
    now = datetime.now()

    if max_profiles and len(URLs_all_page) > max_profiles:
        URLs_all_page = URLs_all_page[:max_profiles]
        print(f"ðŸ” Giá»›i háº¡n {max_profiles} URLs sáº½ xá»­ lÃ½")

    for u in URLs_all_page:
        u_clean = u.split('?')[0]
        if u_clean not in meta:
            new_urls.append(u)
        else:
            last = meta[u_clean].get('last_crawled')
            if last:
                try:
                    last_date = datetime.fromisoformat(last)
                    if (now - last_date).days > MAX_AGE_DAYS:
                        update_urls.append(u)
                except:
                    update_urls.append(u)
            else:
                update_urls.append(u)

    crawl_urls = new_urls + update_urls
    print(f"âœ… URL má»›i: {len(new_urls)}")
    print(f"ðŸ”„ URL cáº§n cáº­p nháº­t (cÅ© hÆ¡n {MAX_AGE_DAYS} ngÃ y): {len(update_urls)}")
    print(f"ðŸ“Œ Tá»•ng sá»‘ URL sáº½ crawl: {len(crawl_urls)}")

    if not crawl_urls:
        print("ðŸš« KhÃ´ng cÃ³ URL nÃ o cáº§n crawl. Káº¿t thÃºc.")
        driver.quit()
        producer.close()
        return

    print("\n5 URLs Ä‘áº§u tiÃªn sáº½ crawl:")
    for i, url in enumerate(crawl_urls[:5]):
        print(f"  {i+1}. {url}")

    # ===== HÃ€M CRAWL Má»˜T PROFILE (Ä‘Æ°á»£c gá»i tá»« cÃ¡c thread) =====
        def crawl_profile(linkedin_url, idx, total):
            global stop_flag
            if stop_flag:
                return None

            options = webdriver.ChromeOptions()
            options.add_argument("--headless=new")
            options.add_argument("--disable-dev-shm-usage")
            options.add_argument("--no-sandbox")
            options.add_argument("--disable-gpu")
            options.add_argument("--window-size=1280,900")
            options.add_argument("--disable-extensions")
            options.add_argument("--disable-blink-features=AutomationControlled")

            thread_driver = create_driver(options=options)
            thread_driver.get("https://www.linkedin.com")
            for cookie in cookies:
                try:
                    thread_driver.add_cookie(cookie)
                except:
                    pass

            # ----- Retry load trang -----
            max_retries = 2
            for attempt in range(max_retries):
                try:
                    print(f"\n[{idx}/{total}] Äang xá»­ lÃ½ (láº§n {attempt+1}): {linkedin_url}")
                    thread_driver.set_page_load_timeout(60)
                    thread_driver.get(linkedin_url)
                    WebDriverWait(thread_driver, WAIT_TIMEOUT).until(
                        EC.presence_of_element_located((By.TAG_NAME, "body"))
                    )
                    # Load thÃ nh cÃ´ng, thoÃ¡t vÃ²ng láº·p retry
                    break
                except TimeoutException as e:
                    print(f"    âš ï¸ Láº§n {attempt+1} timeout: {e}")
                    if attempt == max_retries - 1:
                        thread_driver.quit()
                        return None
                    time.sleep(random.uniform(10, 15))
                except Exception as e:
                    print(f"    âš ï¸ Láº§n {attempt+1} lá»—i khÃ¡c: {e}")
                    if attempt == max_retries - 1:
                        thread_driver.quit()
                        return None
                    time.sleep(random.uniform(5, 10))
            else:
                # Náº¿u vÃ²ng láº·p káº¿t thÃºc mÃ  khÃ´ng break (tá»©c lÃ  táº¥t cáº£ cÃ¡c láº§n Ä‘á»u tháº¥t báº¡i)
                thread_driver.quit()
                return None

            # ----- Scroll vÃ  parse dá»¯ liá»‡u -----
            try:
                time.sleep(random.uniform(5, 8))
                for _ in range(2):
                    thread_driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                    time.sleep(random.uniform(1.5, 2.5))

                soup = BeautifulSoup(thread_driver.page_source, "html.parser")
                profile_data = {
                    "name": None,
                    "location": None,
                    "job_title": None,
                    "education": [],
                    "experience": [],
                    "total_experience_count": 0,
                    "url": linkedin_url
                }

                # Láº¥y tÃªn
                try:
                    name_elem = soup.find("h1", {"class": lambda x: x and any(cls in str(x) for cls in ["text-heading-xlarge", "t-24", "inline"])})
                    if name_elem:
                        profile_data["name"] = name_elem.get_text(strip=True)
                except:
                    pass

                # Láº¥y chá»©c vá»¥
                try:
                    job_elem = soup.find("div", {"class": lambda x: x and any(cls in str(x) for cls in ["text-body-medium", "break-words"])})
                    if job_elem:
                        profile_data["job_title"] = job_elem.get_text(strip=True)
                except:
                    pass

                # Láº¥y Ä‘á»‹a Ä‘iá»ƒm
                try:
                    loc_elem = soup.find("span", {"class": lambda x: x and "text-body-small" in str(x) and "t-black--light" in str(x) and "break-words" in str(x)})
                    if loc_elem:
                        profile_data["location"] = loc_elem.get_text(strip=True)
                except:
                    pass

                # ----- Láº¥y kinh nghiá»‡m -----
                print("    Äang láº¥y thÃ´ng tin kinh nghiá»‡m...")
                try:
                    all_sections = soup.find_all("section")
                    for section in all_sections:
                        h2_tag = section.find("h2")
                        if h2_tag:
                            section_title = h2_tag.get_text(strip=True).lower()
                            if "experience" in section_title or "kinh nghiá»‡m" in section_title or "work" in section_title:
                                exp_items = section.find_all("li", {"class": lambda x: x and any(cls in str(x) for cls in ["artdeco-list__item", "pvs-list__item"])})
                                for item in exp_items:
                                    if len(item.get_text(strip=True)) < 10:
                                        continue
                                    exp_data = {"position": None, "company": None, "employment_type": None, "duration": None}
                                    pos_div = item.find("div", {"class": lambda x: x and "hoverable-link-text" in str(x) and "t-bold" in str(x)})
                                    if pos_div:
                                        pos_span = pos_div.find("span", {"aria-hidden": "true"})
                                        if pos_span:
                                            exp_data["position"] = pos_span.get_text(strip=True)
                                    company_span = item.find("span", {"class": lambda x: x and "t-14" in str(x) and "t-normal" in str(x)})
                                    if company_span:
                                        company_text = company_span.get_text(strip=True)
                                        if "Â·" in company_text:
                                            parts = company_text.split("Â·")
                                            exp_data["company"] = parts[0].strip()
                                            exp_data["employment_type"] = parts[1].strip() if len(parts) > 1 else None
                                        else:
                                            exp_data["company"] = company_text
                                    time_span = item.find("span", {"class": lambda x: x and "pvs-entity__caption-wrapper" in str(x)})
                                    if time_span:
                                        exp_data["duration"] = time_span.get_text(strip=True)

                                    skip_keywords = ["university", "college", "school", "academy", "institute", "certified", "follower", "theo dÃµi", "member"]
                                    should_add = True
                                    if exp_data["position"]:
                                        for kw in skip_keywords:
                                            if kw in exp_data["position"].lower():
                                                should_add = False
                                                break
                                    if should_add and (exp_data["position"] or exp_data["company"]):
                                        profile_data["experience"].append(exp_data)
                except Exception as e:
                    print(f"    Lá»—i khi láº¥y kinh nghiá»‡m: {e}")

                # ----- Láº¥y há»c váº¥n -----
                print("    Äang láº¥y thÃ´ng tin há»c váº¥n...")
                try:
                    all_sections = soup.find_all("section")
                    for section in all_sections:
                        h2_tag = section.find("h2")
                        if h2_tag:
                            section_title = h2_tag.get_text(strip=True).lower()
                            if "education" in section_title or "há»c váº¥n" in section_title:
                                edu_items = section.find_all("li", {"class": lambda x: x and any(cls in str(x) for cls in ["artdeco-list__item", "pvs-list__item"])})
                                for item in edu_items:
                                    if len(item.get_text(strip=True)) < 10:
                                        continue
                                    edu_data = {"school": None, "degree": None, "duration": None}
                                    school_div = item.find("div", {"class": lambda x: x and "hoverable-link-text" in str(x) and "t-bold" in str(x)})
                                    if school_div:
                                        school_span = school_div.find("span", {"aria-hidden": "true"})
                                        if school_span:
                                            edu_data["school"] = school_span.get_text(strip=True)
                                    degree_span = item.find("span", {"class": lambda x: x and "t-14" in str(x) and "t-normal" in str(x)})
                                    if degree_span:
                                        edu_data["degree"] = degree_span.get_text(strip=True)
                                    time_span = item.find("span", {"class": lambda x: x and "pvs-entity__caption-wrapper" in str(x)})
                                    if time_span:
                                        edu_data["duration"] = time_span.get_text(strip=True)

                                    company_keywords = ["gmbh", "ltd", "inc", "corp", "company", "technologies", "software", "solution", "group", "holding", "consulting"]
                                    non_edu_keywords = ["follower", "following", "theo dÃµi", "thÃ nh viÃªn", "member", "connect", "káº¿t ná»‘i", "certified"]
                                    should_add = True
                                    if edu_data["school"]:
                                        school_lower = edu_data["school"].lower()
                                        for kw in company_keywords + non_edu_keywords:
                                            if kw in school_lower:
                                                should_add = False
                                                break
                                    if should_add and edu_data["school"]:
                                        profile_data["education"].append(edu_data)
                except Exception as e:
                    print(f"    Lá»—i khi láº¥y há»c váº¥n: {e}")

                # Cáº­p nháº­t tá»•ng sá»‘ kinh nghiá»‡m
                profile_data["total_experience_count"] = len(profile_data["experience"])

                # TÃ­nh checksum
                checksum = calculate_checksum(profile_data)
                profile_data['_checksum'] = checksum

                # Hiá»ƒn thá»‹ thÃ´ng tin Ä‘Ã£ láº¥y
                print(f"    ÄÃ£ láº¥y Ä‘Æ°á»£c: {profile_data['name']} - {len(profile_data['experience'])} jobs, {len(profile_data['education'])} schools")

                # Gá»­i Kafka
                if producer:
                    producer.send(KAFKA_TOPIC, value=profile_data)
                    print("    ðŸ“¤ ÄÃ£ gá»­i Kafka")

                time.sleep(random.uniform(4, 6))
                return profile_data

            except Exception as e:
                print(f"âŒ Lá»—i {linkedin_url}: {e}")
                return None
            finally:
                thread_driver.quit()
    # ===== CRAWL ÄA LUá»’NG =====
    profiles_data = []
    total_profiles = len(crawl_urls)
    print(f"\n=== Báº¯t Ä‘áº§u crawl {total_profiles} profiles vá»›i 3 threads ===")

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

    # ===== LÆ¯U Káº¾T QUáº¢ =====
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(profiles_data, f, ensure_ascii=False, indent=4)

    print(f"\n=== HOÃ€N THÃ€NH ===")
    print(f"ÄÃ£ crawl thÃ nh cÃ´ng {len(profiles_data)} profiles")
    print(f"Dá»¯ liá»‡u Ä‘Ã£ lÆ°u vÃ o {output_path}")

    # ===== Dá»ŒN Dáº¸P =====
    driver.quit()
    if producer:
        producer.flush()
        producer.close()

# ===== ÄIá»‚M VÃ€O KHI CHáº Y Äá»˜C Láº¬P =====
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Crawl LinkedIn profiles')
    parser.add_argument('--hours', type=int, help='Sá»‘ giá» lá»c thá»i gian')
    parser.add_argument('--max-profiles', type=int, help='Sá»‘ profile tá»‘i Ä‘a cáº§n crawl')
    parser.add_argument('--pages', type=int, help='Sá»‘ trang crawl')
    args = parser.parse_args()
    run_crawler(hours=args.hours, max_profiles=args.max_profiles, pages=args.pages)
