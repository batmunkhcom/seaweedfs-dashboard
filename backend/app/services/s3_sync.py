import json
import asyncio
from datetime import datetime, timezone

from app.config import settings
from app.database import get_db
from app.logging_config import get_logger

logger = get_logger("s3_sync")

S3_GATEWAY_HOSTS = ["172.16.0.2", "172.16.0.4", "172.16.0.6", "172.16.0.7"]
S3_JSON_PATH = "/etc/seaweedfs/s3.json"


async def _gather_s3_users() -> list[dict]:
    db = await get_db()
    cursor = await db.execute(
        "SELECT username, s3_access_key, s3_secret_key, s3_permission FROM users WHERE s3_access_key IS NOT NULL AND s3_access_key != '' AND enabled = 1"
    )
    rows = await cursor.fetchall()
    identities = []
    for row in rows:
        username, ak, sk, perm = row[0], row[1], row[2], row[3]
        actions = ["Read", "Write", "List", "Tagging", "Admin"] if perm == "readwrite" else ["Read", "List"]
        identities.append({
            "Name": username,
            "Credentials": [{"AccessKey": ak, "SecretKey": sk}],
            "Actions": actions,
        })
    return identities


def _build_s3_json(identities: list[dict]) -> dict:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {
        "version": 1,
        "identities": identities,
        "accounts": [],
        "updatedAt": now,
    }


async def sync_to_all_gateways() -> dict[str, bool]:
    if not settings.disk_health_enabled:
        logger.info("s3_sync_skipped", reason="SSH not enabled (disk_health_enabled=False)")
        return {"skipped": True}

    identities = await _gather_s3_users()
    s3_json = _build_s3_json(identities)
    content = json.dumps(s3_json, indent=2)

    results = {}
    for host in S3_GATEWAY_HOSTS:
        try:
            await _ssh_push(host, content)
            results[host] = True
            logger.info("s3_sync_ok", host=host)
        except Exception:
            logger.error("s3_sync_failed", host=host, exc_info=True)
            results[host] = False

    return results


async def _ssh_push(host: str, content: str):
    import paramiko

    key_path = settings.disk_health_ssh_key_path
    key_path_expanded = __import__("os").path.expanduser(key_path)

    loop = asyncio.get_event_loop()

    def _run():
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            client.connect(
                hostname=host,
                username=settings.disk_health_ssh_user,
                key_filename=key_path_expanded,
                timeout=10,
            )
            escaped = content.replace("'", "'\\''")
            cmd = f"echo '{escaped}' > {S3_JSON_PATH}"
            stdin, stdout, stderr = client.exec_command(cmd)
            exit_code = stdout.channel.recv_exit_status()
            if exit_code != 0:
                raise RuntimeError(f"SSH command failed: {stderr.read().decode()}")
        finally:
            client.close()

    await loop.run_in_executor(None, _run)
