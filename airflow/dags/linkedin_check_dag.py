"""
DAG monitor chất lượng output LinkedIn.
Rule:
- profile.name không được null/rỗng
- education.school null/rỗng thì đếm lỗi
- experience.company null/rỗng thì đếm lỗi
- education.degree null thì chấp nhận
"""

from airflow import DAG
from airflow.operators.python import PythonOperator
from datetime import datetime, timedelta
from pathlib import Path
import json
import logging


default_args = {
    "owner": "data_team",
    "depends_on_past": False,
    "email_on_failure": False,
    "email_on_retry": False,
    "retries": 1,
    "retry_delay": timedelta(minutes=5),
    "start_date": datetime(2026, 2, 1),
}

OUTPUT_FILE = Path("/opt/airflow/data/output.json")


def _is_non_empty(value) -> bool:
    return value is not None and str(value).strip() != ""


def check_file_quality(**context):
    log = logging.getLogger(__name__)

    if not OUTPUT_FILE.exists():
        raise FileNotFoundError(f"File not found: {OUTPUT_FILE}")

    with OUTPUT_FILE.open("r", encoding="utf-8") as f:
        data = json.load(f)

    if not isinstance(data, list):
        raise ValueError("output.json must be a JSON array")

    missing_name = 0
    missing_edu_school = 0
    missing_exp_company = 0

    for profile in data:
        if not isinstance(profile, dict):
            continue

        if not _is_non_empty(profile.get("name")):
            missing_name += 1

        education = profile.get("education") or []
        if isinstance(education, list):
            for edu in education:
                if isinstance(edu, dict) and not _is_non_empty(edu.get("school")):
                    missing_edu_school += 1

        experience = profile.get("experience") or []
        if isinstance(experience, list):
            for exp in experience:
                if isinstance(exp, dict) and not _is_non_empty(exp.get("company")):
                    missing_exp_company += 1

    metrics = {
        "total_profiles": len(data),
        "missing_name_profiles": missing_name,
        "missing_education_school_items": missing_edu_school,
        "missing_experience_company_items": missing_exp_company,
    }

    log.info("Quality metrics: %s", metrics)
    return metrics


with DAG(
    dag_id="linkedin_file_checker",
    default_args=default_args,
    description="Check null fields in output.json",
    schedule_interval="0 * * * *",
    catchup=False,
    tags=["linkedin", "monitor", "quality"],
) as dag:
    check_task = PythonOperator(
        task_id="check_file_quality",
        python_callable=check_file_quality,
    )
