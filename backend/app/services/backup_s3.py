import asyncio
import json
from typing import Optional

from app.config import settings
from app.database import get_db
from app.logging_config import get_logger
from app.settings_service import get_setting, get_setting_int

logger = get_logger("backup_s3")


async def _get_s3_credentials() -> dict:
    db = await get_db()
    cursor = await db.execute(
         "SELECT s3_access_key, s3_secret_key FROM users "
         "WHERE username = 'backup' AND s3_access_key != '' LIMIT 1"
     )
    row = await cursor.fetchone()
    if row and row["s3_access_key"]:
        return {"access_key": row["s3_access_key"], "secret_key": row["s3_secret_key"]}
    logger.warning("backup_s3_no_credentials", username="backup")
    return {}


def _get_s3_endpoint() -> str:
    filer_hosts = settings.filer_list
    host = filer_hosts[0].split(":")[0] if filer_hosts else "172.16.0.2"
    return f"http://{host}:8333"


def _get_s3_bucket() -> str:
    return "seaweed-backups"


async def get_s3_bucket() -> str:
    val = await get_setting("backup_s3_bucket", "seaweed-backups")
    return val if val else "seaweed-backups"


async def ensure_backup_bucket() -> dict:
    creds = await _get_s3_credentials()
    bucket = await get_s3_bucket()
    endpoint = _get_s3_endpoint()

    if not creds.get("access_key"):
        return {"ok": False, "error": "Backup S3 user not found. Create a 'backup' user via Settings > Users or S3 > Secrets."}

    env = {**__import__("os").environ}
    env["AWS_ACCESS_KEY_ID"] = creds["access_key"]
    env["AWS_SECRET_ACCESS_KEY"] = creds["secret_key"]
    env["AWS_DEFAULT_REGION"] = "us-east-1"

    try:
        proc = await asyncio.create_subprocess_exec(
             "aws", "s3api", "head-bucket",
            f"--bucket", bucket,
             "--endpoint-url", endpoint,
            env=env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
         )
        _, stderr = await proc.communicate()
        if proc.returncode == 0:
            return {"ok": True, "bucket": bucket, "exists": True}

        proc2 = await asyncio.create_subprocess_exec(
             "aws", "s3", "mb", f"s3://{bucket}",
             "--endpoint-url", endpoint,
            env=env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
         )
        _, stderr2 = await proc2.communicate()
        if proc2.returncode == 0:
            logger.info("backup_bucket_created", bucket=bucket)
            return {"ok": True, "bucket": bucket, "exists": False}

        error_msg = stderr2.decode()[:300] if stderr2 else "Unknown error"
        return {"ok": False, "error": error_msg}
    except FileNotFoundError:
        return {"ok": False, "error": "aws CLI not found"}


async def _aws_s3_upload(local_path: str, s3_key: str) -> bool:
    bucket = await get_s3_bucket()
    endpoint = _get_s3_endpoint()
    creds = await _get_s3_credentials()

    if not creds.get("access_key"):
        raise RuntimeError("S3 credentials not found for user 'backup'")

    env = {**__import__("os").environ}
    env["AWS_ACCESS_KEY_ID"] = creds["access_key"]
    env["AWS_SECRET_ACCESS_KEY"] = creds["secret_key"]
    env["AWS_DEFAULT_REGION"] = "us-east-1"

    try:
        proc = await asyncio.create_subprocess_exec(
             "aws", "s3", "cp", local_path,
            f"s3://{bucket}/{s3_key}",
             "--endpoint-url", endpoint,
            env=env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
         )
        _, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(f"aws s3 cp failed: {stderr.decode()[:500]}")
        logger.info("backup_s3_uploaded", key=s3_key, bucket=bucket)
        return True
    except FileNotFoundError:
        logger.error("aws_cli_not_found", exc_info=True)
        raise RuntimeError("aws CLI not found. Install it or create backup user first.")


async def _aws_s3_download(s3_key: str, local_path: str) -> bool:
    bucket = await get_s3_bucket()
    endpoint = _get_s3_endpoint()
    creds = await _get_s3_credentials()

    if not creds.get("access_key"):
        raise RuntimeError("S3 credentials not found for user 'backup'")

    env = {**__import__("os").environ}
    env["AWS_ACCESS_KEY_ID"] = creds["access_key"]
    env["AWS_SECRET_ACCESS_KEY"] = creds["secret_key"]
    env["AWS_DEFAULT_REGION"] = "us-east-1"

    try:
        proc = await asyncio.create_subprocess_exec(
             "aws", "s3", "cp",
            f"s3://{bucket}/{s3_key}", local_path,
             "--endpoint-url", endpoint,
            env=env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
         )
        _, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(f"aws s3 cp download failed: {stderr.decode()[:500]}")
        logger.info("backup_s3_downloaded", key=s3_key)
        return True
    except FileNotFoundError:
        logger.error("aws_cli_not_found", exc_info=True)
        raise RuntimeError("aws CLI not found. Install it or create backup user first.")


async def _aws_s3_delete(s3_key: str) -> bool:
    bucket = await get_s3_bucket()
    endpoint = _get_s3_endpoint()
    creds = await _get_s3_credentials()

    if not creds.get("access_key"):
        return False

    env = {**__import__("os").environ}
    env["AWS_ACCESS_KEY_ID"] = creds["access_key"]
    env["AWS_SECRET_ACCESS_KEY"] = creds["secret_key"]
    env["AWS_DEFAULT_REGION"] = "us-east-1"

    try:
        proc = await asyncio.create_subprocess_exec(
             "aws", "s3", "rm", f"s3://{bucket}/{s3_key}",
             "--endpoint-url", endpoint,
            env=env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
         )
        await proc.communicate()
        logger.info("backup_s3_deleted", key=s3_key)
        return True
    except FileNotFoundError:
        return False


async def _aws_s3_list(prefix: str) -> list[dict]:
    bucket = await get_s3_bucket()
    endpoint = _get_s3_endpoint()
    creds = await _get_s3_credentials()

    if not creds.get("access_key"):
        return []

    env = {**__import__("os").environ}
    env["AWS_ACCESS_KEY_ID"] = creds["access_key"]
    env["AWS_SECRET_ACCESS_KEY"] = creds["secret_key"]
    env["AWS_DEFAULT_REGION"] = "us-east-1"

    try:
        proc = await asyncio.create_subprocess_exec(
             "aws", "s3", "ls", f"s3://{bucket}/{prefix}",
             "--endpoint-url", endpoint,
             "--recursive",
            env=env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
         )
        stdout, _ = await proc.communicate()
        items = []
        for line in stdout.decode().strip().split("\n"):
            if not line.strip():
                continue
            parts = line.split()
            if len(parts) >= 3:
                date_str = f"{parts[0]} {parts[1]}"
                size = int(parts[2])
                key = "/".join(parts[3:])
                items.append({"key": key, "size": size, "date": date_str})
        return items
    except FileNotFoundError:
        return []


async def cleanup_old_backups() -> dict:
    retention_days = await get_setting_int("backup_retention_days", 30)
    if retention_days <= 0:
        return {"ok": True, "deleted": 0, "reason": "retention disabled"}

    cutoff = __import__("datetime").datetime.now(__import__("datetime").timezone.utc) - __import__("datetime").timedelta(days=retention_days)
    cutoff_iso = cutoff.isoformat()

    db = await get_db()
    cursor = await db.execute(
         "SELECT name, s3_key FROM backup_snapshots WHERE created_at < ? AND status = 'uploaded'",
         (cutoff_iso,),
     )
    rows = await cursor.fetchall()

    deleted = 0
    for row in rows:
        ok = await _aws_s3_delete(row["s3_key"])
        if ok:
            await db.execute("DELETE FROM backup_snapshots WHERE name=?", (row["name"],))
            deleted += 1
            logger.info("backup_cleanup_deleted", name=row["name"], s3_key=row["s3_key"])

    await db.commit()
    return {"ok": True, "deleted": deleted}
