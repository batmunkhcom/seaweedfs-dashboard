import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings
from app.database import get_db
from app.logging_config import get_logger
from app.settings_service import get_setting, get_setting_int

logger = get_logger("backup")


async def _get_filer_hosts() -> list[str]:
    raw = await get_setting("seaweedfs_filer_host", settings.seaweedfs_filer_host)
    return [h.strip().split(":")[0] for h in raw.split(",") if h.strip()]


async def _ssh_exec(host: str, cmd: str, timeout: int = 120) -> tuple[str, str, int]:
    import paramiko

    key_path = Path(settings.disk_health_ssh_key_path).expanduser()
    loop = asyncio.get_event_loop()
    result = {"stdout": "", "stderr": "", "exit_code": 1}

    def _run():
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            client.connect(
                hostname=host,
                username=settings.disk_health_ssh_user,
                key_filename=str(key_path),
                timeout=10,
            )
            stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
            result["stdout"] = stdout.read().decode(errors="replace")
            result["stderr"] = stderr.read().decode(errors="replace")
            result["exit_code"] = stdout.channel.recv_exit_status()
        finally:
            client.close()

    await loop.run_in_executor(None, _run)
    return result["stdout"], result["stderr"], result["exit_code"]


async def create_backup(name: str | None = None) -> dict:
    enabled = await get_setting("backup_enabled", "true")
    if enabled.lower() != "true":
        return {"ok": False, "error": "Backup is disabled. Enable in runtime_settings."}

    filer_hosts = await _get_filer_hosts()
    db_path = await get_setting("backup_filer_db_path", "/data/dc03/filer/filerldb2")

    if not filer_hosts:
        return {"ok": False, "error": "No filer hosts configured"}

    now = datetime.now(timezone.utc)
    ts = now.strftime("%Y%m%d_%H%M%S")
    backup_name = name or f"backup-{ts}"
    backup_file = Path("/srv/seaweed-backups") / f"{backup_name}.tar.gz"

    await backup_file.parent.mkdir(parents=True, exist_ok=True)

    db = await get_db()
    started_at = now.isoformat()
    cursor = await db.execute(
        "INSERT INTO backup_snapshots (name, s3_key, filer_hosts, status, created_at) VALUES (?, ?, ?, 'running', ?)",
        (backup_name, str(backup_file), json.dumps(filer_hosts), started_at),
    )
    await db.commit()
    sync_id = cursor.lastrowid

    total_bytes = 0
    results: dict[str, str] = {}
    error_msg: str | None = None

    for host in filer_hosts:
        try:
            stdout, stderr, exit_code = await _ssh_exec(
                host, f"du -sb {db_path} | awk '{{print $1}}'"
            )
            if exit_code == 0 and stdout.strip():
                total_bytes += int(stdout.strip())
                logger.info("backup_size", host=host, bytes=total_bytes)
        except Exception as e:
            error_msg = str(e)
            logger.error("backup_ssh_failed", host=host, exc_info=True)

    for host in filer_hosts:
        try:
            tmp_remote = f"/tmp/filer-backup-{ts}.tar.gz"
            await _ssh_exec(host, f"tar czf {tmp_remote} -C {db_path} .")
            _, stderr2, exit_code2 = await _ssh_exec(
                host, f"scp {tmp_remote} root@172.16.0.10:{backup_file}"
            )
            if exit_code2 != 0:
                raise RuntimeError(f"SCP failed: {stderr2[:200]}")
            await _ssh_exec(host, f"rm -f {tmp_remote}")
            results[host] = "scp_ok"
        except Exception as e:
            results[host] = str(e)[:200]
            error_msg = f"{error_msg or ''} {host}: {e}"
            logger.error("backup_filer_failed", host=host, exc_info=True)

    finished_at = datetime.now(timezone.utc).isoformat()
    ok = all(v == "scp_ok" for v in results.values()) and bool(total_bytes)
    status = "uploaded" if ok else ("failed" if error_msg else "partial")

    await db.execute(
        "UPDATE backup_snapshots SET size_bytes=?, status=?, created_at=? WHERE id=?",
        (total_bytes, status, finished_at, sync_id),
    )
    await db.commit()

    asyncio.create_task(cleanup_old_backups())

    return {
        "ok": ok,
        "syncId": str(sync_id),
        "name": backup_name,
        "s3Key": str(backup_file),
        "bytesSynced": total_bytes,
        "results": results,
        "finishedAt": finished_at,
    }


async def list_backups() -> list[dict]:
    Path("/srv/seaweed-backups").mkdir(parents=True, exist_ok=True)

    db = await get_db()
    cursor = await db.execute(
         "SELECT id, name, s3_key, size_bytes, filer_hosts, status, created_at "
         "FROM backup_snapshots ORDER BY id DESC"
     )
    rows = await cursor.fetchall()
    backups = []
    for row in rows:
        d = dict(row)
        d["filer_hosts"] = json.loads(d["filer_hosts"]) if isinstance(d["filer_hosts"], str) else d["filer_hosts"]
        d["size"] = d["size_bytes"]

        file_path = Path(d["s3_key"])
        try:
            if file_path.exists():
                actual_size = file_path.stat().st_size
                if d["size"] == 0:
                    await db.execute("UPDATE backup_snapshots SET size_bytes=? WHERE id=?", (actual_size, d["id"]))
                    d["size"] = actual_size
            else:
                d["status"] = "missing"
        except Exception:
            pass

        backups.append(d)

    return backups


async def delete_backup(name: str) -> bool:
    Path("/srv/seaweed-backups").mkdir(parents=True, exist_ok=True)

    db = await get_db()
    cursor = await db.execute(
        "SELECT s3_key, id FROM backup_snapshots WHERE name=?", (name,)
    )
    row = await cursor.fetchone()
    if not row:
        return False

    file_path = Path(row["s3_key"])
    if file_path.exists():
        file_path.unlink()
        logger.info("backup_deleted", name=name, path=str(file_path))

    await db.execute("DELETE FROM backup_snapshots WHERE name=?", (name,))
    await db.commit()
    return True


async def restore_backup(name: str) -> dict:
    enabled = await get_setting("backup_enabled", "true")
    if enabled.lower() != "true":
        return {"ok": False, "error": "Backup is disabled"}

    filer_hosts = await _get_filer_hosts()
    db_path = await get_setting("backup_filer_db_path", "/data/dc03/filer/filerldb2")

    backup_file = Path("/srv/seaweed-backups") / f"{name}.tar.gz"
    if not backup_file.exists():
        raise FileNotFoundError(f"Backup file not found: {name}")

    results: dict[str, str] = {}
    error_msg: str | None = None

    for host in filer_hosts[:1]:
        try:
            tmp_remote = f"/tmp/filer-restore-{name}.tar.gz"
            _, stderr1, exit_code1 = await _ssh_exec(
                host, f"scp root@172.16.0.10:{backup_file} {tmp_remote}"
            )
            if exit_code1 != 0:
                raise RuntimeError(f"SCP failed: {stderr1[:200]}")

            _, stderr2, exit_code2 = await _ssh_exec(
                host, f"tar xzf {tmp_remote} -C {db_path}/.. && rm -f {tmp_remote}"
            )
            if exit_code2 != 0:
                raise RuntimeError(f"Extract failed: {stderr2[:200]}")

            results[host] = "ok"
            logger.info("backup_restore_ok", host=host, name=name)
        except Exception as e:
            results[host] = str(e)[:200]
            error_msg = f"{error_msg or ''} {host}: {e}"
            logger.error("backup_restore_failed", host=host, exc_info=True)

    return {
        "ok": all(v == "ok" for v in results.values()),
        "results": results,
        "name": name,
    }


async def get_backup_status() -> dict:
    db = await get_db()
    cursor = await db.execute(
        "SELECT * FROM backup_snapshots ORDER BY id DESC LIMIT 1"
    )
    row = await cursor.fetchone()

    if not row:
        return {"running": False, "lastSyncAt": None, "lastError": None, "bytesSynced": 0}

    status_val = row["status"]
    return {
        "running": status_val == "running",
        "lastSyncAt": row["created_at"],
        "lastError": None if status_val in ("uploaded", "partial") else row.get("status"),
        "bytesSynced": row["size_bytes"] or 0,
    }


async def cleanup_old_backups() -> dict:
    Path("/srv/seaweed-backups").mkdir(parents=True, exist_ok=True)

    retention_days = await get_setting_int("backup_retention_days", 30)
    if retention_days <= 0:
        return {"ok": True, "deleted": 0, "reason": "retention disabled"}

    cutoff = datetime.now(timezone.utc) - __import__("datetime").timedelta(days=retention_days)
    cutoff_iso = cutoff.isoformat()

    db = await get_db()
    cursor = await db.execute(
        "SELECT name, s3_key FROM backup_snapshots WHERE created_at < ? AND status = 'uploaded'",
        (cutoff_iso,),
    )
    rows = await cursor.fetchall()

    deleted = 0
    for row in rows:
        file_path = Path(row["s3_key"])
        if file_path.exists():
            file_path.unlink()
        await db.execute("DELETE FROM backup_snapshots WHERE name=?", (row["name"],))
        deleted += 1
        logger.info("backup_cleanup_deleted", name=row["name"], s3_key=row["s3_key"])

    await db.commit()
    return {"ok": True, "deleted": deleted}
