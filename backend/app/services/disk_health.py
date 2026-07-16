import asyncio
import json
import time

from app.config import settings
from app.database import get_db
from app.settings_service import get_setting_int
from app.logging_config import get_logger

logger = get_logger("disk_health")

_scan_task: asyncio.Task | None = None
_last_restart_at: float = 0
_instance_count = 0


class DiskHealthService:
    def __init__(self):
        global _instance_count
        _instance_count += 1
        self._running = False

    async def start(self):
        global _scan_task, _last_restart_at
        if not settings.disk_health_enabled:
            logger.info("disk_health_disabled")
            return

        now = time.time()
        if now - _last_restart_at < 300:
            logger.warning("disk_health_restart_cooldown", last=_last_restart_at)
            return
        _last_restart_at = now

        if _scan_task and not _scan_task.done():
            _scan_task.cancel()
            try:
                await _scan_task
            except asyncio.CancelledError:
                pass

        self._running = True
        _scan_task = asyncio.create_task(self._scan_loop())
        self._update_heartbeat()
        logger.info("disk_health_started")

    async def stop(self):
        self._running = False
        global _scan_task, _instance_count
        _instance_count -= 1
        if _scan_task and not _scan_task.done():
            _scan_task.cancel()
            try:
                await _scan_task
            except asyncio.CancelledError:
                pass
        logger.info("disk_health_stopped")

    async def scan(self):
        asyncio.create_task(self._scan_all_nodes())
        return {"ok": True}

    async def _scan_loop(self):
        while self._running:
            try:
                await self._scan_all_nodes()
                self._update_heartbeat()
            except Exception:
                logger.error("disk_health_scan_failed", exc_info=True)
            try:
                interval = await get_setting_int("disk_health_scan_interval_hours", 24)
            except Exception:
                logger.error("disk_health_interval_load_failed", exc_info=True)
                interval = 24
            await asyncio.sleep(interval * 3600)

    async def _scan_all_nodes(self):
        hosts = [h.split(":")[0] for h in settings.master_list + settings.filer_list]
        hosts = list(dict.fromkeys(hosts))
        import os as _os, paramiko

        key_path = _os.path.expanduser(settings.disk_health_ssh_key_path)

        loop = asyncio.get_event_loop()

        for host in hosts:
            try:
                def _ssh_scan(h=host):
                    ssh = paramiko.SSHClient()
                    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
                    ssh.connect(h, username=settings.disk_health_ssh_user, key_filename=key_path, timeout=10)
                    try:
                        _, stdout, _ = ssh.exec_command("lsblk --json -o NAME,SIZE,TYPE,MOUNTPOINT 2>/dev/null")
                        lsblk_data = json.loads(stdout.read().decode())
                        devices = [b["name"] for b in lsblk_data.get("blockdevices", []) if b.get("type") == "disk"]
                        results = []
                        for dev in devices:
                            _, stdout2, _ = ssh.exec_command(f"smartctl --json -a /dev/{dev} 2>/dev/null")
                            smart_raw = stdout2.read().decode()
                            if smart_raw.strip():
                                results.append((dev, smart_raw))
                        return results
                    finally:
                        ssh.close()

                results = await loop.run_in_executor(None, _ssh_scan, host)
                db = await get_db()
                for dev, smart_raw in results:
                    await db.execute(
                        "INSERT INTO disk_health (node, device, timestamp, smart_json) VALUES (?, ?, ?, ?)",
                        (host, f"/dev/{dev}", time.time(), smart_raw),
                    )
                # Also insert basic info for disks without SMART
                if not results:
                    def _basic_scan(h=host):
                        ssh = paramiko.SSHClient()
                        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
                        ssh.connect(h, username=settings.disk_health_ssh_user, key_filename=key_path, timeout=10)
                        try:
                            _, stdout, _ = ssh.exec_command("lsblk --json -b -o NAME,SIZE,TYPE,MOUNTPOINT 2>/dev/null")
                            lsblk_data = json.loads(stdout.read().decode())
                            usage = {}
                            for dev in lsblk_data.get("blockdevices", []):
                                mp = dev.get("mountpoint") or ""
                                if mp.startswith("/data"):
                                    try:
                                        _, df_out, _ = ssh.exec_command(f"df -B1 --output=size,used,avail,pcent {mp} 2>/dev/null")
                                        df_lines = df_out.read().decode().strip().split('\n')
                                        if len(df_lines) > 1:
                                            parts = df_lines[1].split()
                                            if len(parts) >= 4:
                                                usage = {"total_gb": round(int(parts[0]) / 1e9, 1), "used_gb": round(int(parts[1]) / 1e9, 1),
                                                         "avail_gb": round(int(parts[2]) / 1e9, 1), "pct": parts[3].rstrip('%')}
                                    except Exception:
                                        pass
                                for child in dev.get("children", []):
                                    mp_c = child.get("mountpoint") or ""
                                    if mp_c.startswith("/data") and not usage:
                                        try:
                                            _, df_out, _ = ssh.exec_command(f"df -B1 --output=size,used,avail,pcent {mp_c} 2>/dev/null")
                                            df_lines = df_out.read().decode().strip().split('\n')
                                            if len(df_lines) > 1:
                                                parts = df_lines[1].split()
                                                if len(parts) >= 4:
                                                    usage = {"total_gb": round(int(parts[0]) / 1e9, 1), "used_gb": round(int(parts[1]) / 1e9, 1),
                                                             "avail_gb": round(int(parts[2]) / 1e9, 1), "pct": parts[3].rstrip('%')}
                                        except Exception:
                                            pass
                            return lsblk_data, usage
                        finally:
                            ssh.close()
                    basic, usage = await loop.run_in_executor(None, _basic_scan)
                    db = await get_db()
                    for b in basic.get("blockdevices", []):
                        if b.get("type") != "disk":
                            continue
                        children = b.get("children", [])
                        has_data_mount = (
                            ((b.get("mountpoint") or "").startswith("/data")) or
                            any((c.get("mountpoint") or "").startswith("/data") for c in children)
                        )
                        size_bytes = b.get("size", 0)
                        if not has_data_mount and size_bytes < 100 * 1024 * 1024 * 1024:
                            continue
                        smart_json = {
                            "model_name": "Virtual Disk",
                            "user_capacity": {"bytes": size_bytes},
                            "smart_status": {"passed": True},
                            "temperature": {"current": None},
                        }
                        if has_data_mount and usage:
                            smart_json["usage"] = usage
                        await db.execute(
                            "INSERT INTO disk_health (node, device, timestamp, smart_json) VALUES (?, ?, ?, ?)",
                            (host, f"/dev/{b['name']}", time.time(), json.dumps(smart_json)),
                        )
                    await db.commit()
                    logger.info("disk_health_basic_scan", host=host, devices=sum(1 for b in basic.get("blockdevices", []) if b.get("type") == "disk"))
            except Exception:
                logger.error("disk_health_node_failed", host=host, exc_info=True)

    def _update_heartbeat(self):
        asyncio.create_task(self._write_heartbeat())

    async def _write_heartbeat(self):
        try:
            db = await get_db()
            await db.execute(
                "INSERT OR REPLACE INTO services_health (name, last_heartbeat, ttl_seconds) VALUES (?, datetime('now'), ?)",
                ("disk_health", 300),
            )
            await db.commit()
        except Exception:
            pass


_disk_health: DiskHealthService | None = None


def get_disk_health() -> DiskHealthService:
    global _disk_health
    if _disk_health is None:
        _disk_health = DiskHealthService()
    return _disk_health


async def start_disk_health():
    await get_disk_health().start()


async def stop_disk_health():
    global _disk_health
    if _disk_health:
        await _disk_health.stop()
        _disk_health = None
