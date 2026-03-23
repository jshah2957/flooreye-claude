"""Automated MongoDB backup to S3."""
import os
import subprocess
import logging
import tarfile
import tempfile
from datetime import datetime, timezone
from app.workers.celery_app import celery_app
from app.workers.dead_letter import DeadLetterTask
from app.core.config import settings

log = logging.getLogger(__name__)


@celery_app.task(name="app.workers.backup_worker.run_backup", bind=True, max_retries=1, base=DeadLetterTask)
def run_backup(self):
    """Dump MongoDB database, compress, and upload to S3."""
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_bucket = getattr(settings, "BACKUP_S3_BUCKET", settings.S3_BUCKET_NAME)

    with tempfile.TemporaryDirectory() as tmpdir:
        dump_dir = os.path.join(tmpdir, f"flooreye_backup_{timestamp}")

        # Parse MongoDB URI for host/port/db
        uri = settings.MONGODB_URI
        db_name = settings.MONGODB_DB

        # Run mongodump
        cmd = ["mongodump", f"--uri={uri}", f"--db={db_name}", f"--out={dump_dir}"]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
            if result.returncode != 0:
                log.error("mongodump failed: %s", result.stderr)
                raise Exception(f"mongodump failed: {result.stderr[:500]}")
        except FileNotFoundError:
            log.error("mongodump not found — install mongodb-database-tools")
            raise

        # Compress
        archive_path = os.path.join(tmpdir, f"flooreye_backup_{timestamp}.tar.gz")
        with tarfile.open(archive_path, "w:gz") as tar:
            tar.add(dump_dir, arcname=f"flooreye_backup_{timestamp}")

        # Upload to S3
        try:
            import boto3
            s3 = boto3.client(
                "s3",
                endpoint_url=settings.S3_ENDPOINT_URL,
                aws_access_key_id=settings.S3_ACCESS_KEY_ID,
                aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
                region_name=settings.S3_REGION,
            )
            s3_key = f"backups/{timestamp}.tar.gz"
            s3.upload_file(archive_path, backup_bucket, s3_key)
            log.info("Backup uploaded to s3://%s/%s", backup_bucket, s3_key)
        except Exception as e:
            log.error("Failed to upload backup to S3: %s", e)
            raise

    return {"status": "success", "timestamp": timestamp, "s3_key": s3_key}
