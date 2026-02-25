"""
LinkedIn pipeline DAG:
crawl -> consume kafka -> validate null fields -> import mongodb
"""

from __future__ import annotations

from airflow import DAG
from airflow.operators.bash import BashOperator
from airflow.operators.python import PythonOperator
from datetime import datetime, timedelta
from pathlib import Path
import json
import logging
import os
import re

from kafka import KafkaConsumer
from pymongo import MongoClient, UpdateOne


default_args = {
    "owner": "data_team",
    "depends_on_past": False,
    "retries": 2,
    "retry_delay": timedelta(minutes=3),
    "email_on_failure": False,
    "email_on_retry": False,
    "start_date": datetime(2026, 2, 1),
}

KAFKA_BROKER = os.getenv("KAFKA_BROKER", "kafka:29092")
KAFKA_TOPIC = "linkedin-profiles"
KAFKA_GROUP_ID = "airflow-linkedin-pipeline"
MONGO_URI = os.getenv(
    "MONGODB_URI",
    "mongodb://admin:admin123@mongodb:27017/linkedin_candidates?authSource=admin",
)

DATA_DIR = Path("/opt/airflow/data")
OUTPUT_FILE = DATA_DIR / "output.json"
RUN_DIR = DATA_DIR / "pipeline_runs"
RUN_DIR.mkdir(parents=True, exist_ok=True)

CRAWLER_SCRIPT = "/opt/airflow/dags/scripts/crawler.py"


def _safe_run_id(raw: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]", "_", raw)


def _is_non_empty(value) -> bool:
    return value is not None and str(value).strip() != ""


def consume_kafka_messages(**context):
    log = logging.getLogger(__name__)
    run_id = _safe_run_id(context["run_id"])
    consumed_file = RUN_DIR / f"consumed_{run_id}.json"

    consumer = KafkaConsumer(
        KAFKA_TOPIC,
        bootstrap_servers=KAFKA_BROKER,
        value_deserializer=lambda m: json.loads(m.decode("utf-8")),
        auto_offset_reset="latest",
        enable_auto_commit=True,
        group_id=KAFKA_GROUP_ID,
        max_poll_records=200,
        consumer_timeout_ms=12000,
    )

    profiles = []
    start = datetime.utcnow()
    max_runtime = timedelta(minutes=3)

    try:
        for message in consumer:
            if datetime.utcnow() - start > max_runtime:
                break
            if isinstance(message.value, dict):
                profiles.append(message.value)
    finally:
        consumer.close()

    # Fallback: if Kafka batch empty, read crawler output.json
    if not profiles and OUTPUT_FILE.exists():
        try:
            with OUTPUT_FILE.open("r", encoding="utf-8") as f:
                output_data = json.load(f)
            if isinstance(output_data, list):
                profiles = output_data
                log.warning("No kafka messages in this run, fallback to output.json")
        except Exception as exc:
            log.error("Cannot read output.json fallback: %s", exc)

    with consumed_file.open("w", encoding="utf-8") as f:
        json.dump(profiles, f, ensure_ascii=False, indent=2)

    log.info("Consumed profiles: %s", len(profiles))
    context["ti"].xcom_push(key="consumed_file", value=str(consumed_file))
    return len(profiles)


def validate_profiles(**context):
    log = logging.getLogger(__name__)
    run_id = _safe_run_id(context["run_id"])

    consumed_file = context["ti"].xcom_pull(key="consumed_file", task_ids="consume_kafka_messages")
    if not consumed_file:
        raise ValueError("Missing consumed_file from previous task")

    source = Path(consumed_file)
    if not source.exists():
        raise FileNotFoundError(f"File not found: {source}")

    with source.open("r", encoding="utf-8") as f:
        profiles = json.load(f)

    valid_profiles = []
    dropped_profiles = 0
    dropped_education_items = 0
    dropped_experience_items = 0

    for profile in profiles:
        if not isinstance(profile, dict):
            dropped_profiles += 1
            continue

        name = profile.get("name")
        if not _is_non_empty(name):
            dropped_profiles += 1
            continue

        education = profile.get("education") or []
        if not isinstance(education, list):
            education = []

        valid_education = []
        for edu in education:
            if not isinstance(edu, dict):
                dropped_education_items += 1
                continue
            if not _is_non_empty(edu.get("school")):
                dropped_education_items += 1
                continue
            valid_education.append(
                {
                    "school": edu.get("school"),
                    "degree": edu.get("degree"),  # degree null is acceptable
                    "duration": edu.get("duration"),
                }
            )

        experience = profile.get("experience") or []
        if not isinstance(experience, list):
            experience = []

        valid_experience = []
        for exp in experience:
            if not isinstance(exp, dict):
                dropped_experience_items += 1
                continue
            if not _is_non_empty(exp.get("company")):
                dropped_experience_items += 1
                continue
            valid_experience.append(
                {
                    "position": exp.get("position"),
                    "company": exp.get("company"),
                    "employment_type": exp.get("employment_type"),
                    "duration": exp.get("duration"),
                }
            )

        cleaned = dict(profile)
        cleaned["name"] = str(name).strip()
        cleaned["education"] = valid_education
        cleaned["experience"] = valid_experience
        valid_profiles.append(cleaned)

    validated_file = RUN_DIR / f"validated_{run_id}.json"
    with validated_file.open("w", encoding="utf-8") as f:
        json.dump(valid_profiles, f, ensure_ascii=False, indent=2)

    metrics = {
        "total_input": len(profiles),
        "valid_profiles": len(valid_profiles),
        "dropped_profiles": dropped_profiles,
        "dropped_education_items": dropped_education_items,
        "dropped_experience_items": dropped_experience_items,
    }

    log.info("Validation metrics: %s", metrics)
    context["ti"].xcom_push(key="validated_file", value=str(validated_file))
    context["ti"].xcom_push(key="validation_metrics", value=metrics)
    return metrics


def import_to_mongodb(**context):
    log = logging.getLogger(__name__)

    validated_file = context["ti"].xcom_pull(key="validated_file", task_ids="validate_profiles")
    if not validated_file:
        raise ValueError("Missing validated_file from previous task")

    file_path = Path(validated_file)
    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    with file_path.open("r", encoding="utf-8") as f:
        profiles = json.load(f)

    if not profiles:
        log.warning("No valid profiles to import")
        return {"upserted": 0, "modified": 0, "matched": 0, "skipped": 0}

    bulk_ops = []
    skipped = 0
    for profile in profiles:
        linkedin_key = profile.get("linkedin_url") or profile.get("url")
        if not _is_non_empty(linkedin_key):
            skipped += 1
            continue

        bulk_ops.append(
            UpdateOne(
                {"linkedin_url": linkedin_key},
                {"$set": {**profile, "linkedin_url": linkedin_key}},
                upsert=True,
            )
        )

    if not bulk_ops:
        log.warning("All records skipped because missing linkedin_url/url")
        return {"upserted": 0, "modified": 0, "matched": 0, "skipped": skipped}

    client = MongoClient(MONGO_URI)
    try:
        db = client.get_database()
        collection = db.candidates
        result = collection.bulk_write(bulk_ops, ordered=False)
    finally:
        client.close()

    summary = {
        "upserted": result.upserted_count,
        "modified": result.modified_count,
        "matched": result.matched_count,
        "skipped": skipped,
    }
    log.info("Mongo import summary: %s", summary)
    return summary


def log_summary(**context):
    log = logging.getLogger(__name__)
    validation = context["ti"].xcom_pull(task_ids="validate_profiles") or {}
    mongo = context["ti"].xcom_pull(task_ids="import_to_mongodb") or {}

    log.info("Pipeline completed")
    log.info("Validation: %s", validation)
    log.info("Mongo import: %s", mongo)


with DAG(
    dag_id="linkedin_crawl_consume_validate_import",
    default_args=default_args,
    description="crawl -> consume kafka -> checklist null -> import mongodb",
    schedule_interval="0 8,11,14,18 * * *",
    catchup=False,
    max_active_runs=1,
    tags=["linkedin", "pipeline", "kafka", "mongodb"],
) as dag:

    crawl_task = BashOperator(
        task_id="crawl_linkedin",
        bash_command=(
            f"python {CRAWLER_SCRIPT} --hours 24 --max-profiles 50 --pages 2"
        ),
    )

    consume_task = PythonOperator(
        task_id="consume_kafka_messages",
        python_callable=consume_kafka_messages,
    )

    validate_task = PythonOperator(
        task_id="validate_profiles",
        python_callable=validate_profiles,
    )

    import_task = PythonOperator(
        task_id="import_to_mongodb",
        python_callable=import_to_mongodb,
    )

    summary_task = PythonOperator(
        task_id="log_summary",
        python_callable=log_summary,
    )

    crawl_task >> consume_task >> validate_task >> import_task >> summary_task
