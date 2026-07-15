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

    async def _scan_loop(self):
        while self._running:
            try:
                await self._scan_all_nodes()
                self._update_heartbeat()
            except Exception:
                logger.error("disk_health_scan_failed", exc_info=True)
            await asyncio.sleep(await get_setting_int("disk_health_scan_interval_hours", 24) * 3600)

    async def _scan_all_nodes(self):
        hosts = [h.split(":")[0] for h in settings.master_list + settings.filer_list]
        hosts = list(dict.fromkeys(hosts))
        import os as _os, paramiko

        key_path = _os.path.expanduser(settings.disk_health_ssh_key_path)

        for host in hosts:
            try:
                ssh = paramiko.SSHClient()
                ssh.load_system_host_keys()
                ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
                ssh.connect(
                    host,
                    username=settings.disk_health_ssh_user,
                    key_filename=key_path,
                    timeout=10,
                )

                _, stdout, _ = ssh.exec_command("lsblk --json -o NAME,SIZE,TYPE,MOUNTPOINT 2>/dev/null")
                lsblk_data = json.loads(stdout.read().decode())
                devices = [
                    b["name"] for b in lsblk_data.get("blockdevices", []) if b.get("type") == "disk"
                ]

                for dev in devices:
                    _, stdout, _ = ssh.exec_command(f"smartctl --json -a /dev/{dev} 2>/dev/null")
                    smart_raw = stdout.read().decode()
                    if not smart_raw.strip():
                        continue
                    smart_data = json.loads(smart_raw)

                    db = await get_db()
                    await db.execute(
                        """
                        INSERT INTO disk_health (node, device, timestamp, smart_json)
                        VALUES (?, ?, ?, ?)
                        """,
                        (host, f"/dev/{dev}", time.time(), smart_raw),
                    )
                    await db.commit()

                ssh.close()
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
