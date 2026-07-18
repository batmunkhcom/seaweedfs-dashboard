import asyncio
import time

import paramiko

from app.config import settings
from app.database import get_db
from app.settings_service import get_setting
from app.logging_config import get_logger

logger = get_logger("hardening_service")

_eval_task: asyncio.Task | None = None
_last_restart_at: float = 0
_instance_count = 0

SSH_USER = settings.disk_health_ssh_user
SSH_KEY_PATH = settings.disk_health_ssh_key_path


class HardeningService:
    def __init__(self):
        global _instance_count
        _instance_count += 1
        self._running = False

    async def start(self):
        global _eval_task, _last_restart_at
        now = time.time()
        if now - _last_restart_at < 300:
            return
        _last_restart_at = now

        if _eval_task and not _eval_task.done():
            _eval_task.cancel()
            try:
                await _eval_task
            except asyncio.CancelledError:
                pass

        self._running = True
        _eval_task = asyncio.create_task(self._scheduler_loop())
        self._update_heartbeat()
        logger.info("hardening_service_started")

    async def stop(self):
        self._running = False
        global _eval_task, _instance_count
        _instance_count -= 1
        if _eval_task and not _eval_task.done():
            _eval_task.cancel()
            try:
                await _eval_task
            except asyncio.CancelledError:
                pass
        logger.info("hardening_service_stopped")

    async def _scheduler_loop(self):
        while self._running:
            try:
                await self._run_scheduled_tasks()
                self._update_heartbeat()
            except Exception:
                logger.error("hardening_scheduler_failed", exc_info=True)
            await asyncio.sleep(3600)

    async def _run_scheduled_tasks(self):
        checksum_enabled = (await get_setting("hardening_checksum_enabled", "false")) == "true"
        if checksum_enabled:
            await self.verify_checksums_all()

    def _ssh_client(self) -> paramiko.SSHClient:
        import os
        key_path = os.path.expanduser(SSH_KEY_PATH)
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.WarningPolicy())
        client.load_system_host_keys()
        key = paramiko.RSAKey.from_private_key_file(key_path)
        client.connect(hostname="", username=SSH_USER, pkey=key)
        return client

    async def _ssh_exec(self, host: str, command: str, timeout: int = 60) -> tuple[str, str, int]:
        loop = asyncio.get_event_loop()

        def _run():
            import os
            key_path = os.path.expanduser(SSH_KEY_PATH)
            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.WarningPolicy())
            client.load_system_host_keys()
            key = paramiko.RSAKey.from_private_key_file(key_path)
            client.connect(hostname=host, username=SSH_USER, pkey=key, timeout=10)
            try:
                stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
                exit_code = stdout.channel.recv_exit_status()
                return stdout.read().decode(), stderr.read().decode(), exit_code
            finally:
                client.close()

        try:
            return await asyncio.wait_for(loop.run_in_executor(None, _run), timeout=timeout + 15)
        except asyncio.TimeoutError:
            return "", "SSH timeout", -1
        except Exception as e:
            return "", str(e), -1

    async def verify_checksums_all(self) -> dict:
        results = {}
        for host in settings.all_node_hosts:
            try:
                stdout, stderr, exit_code = await self._ssh_exec(
                    host,
                    f"cd /data/dc03 && weed fix -dir=./ -volumeServer={host}:8080 -metricsPort=9328 2>&1",
                    timeout=120,
                )
                results[host] = {
                    "ok": exit_code == 0,
                    "exit_code": exit_code,
                    "output": stdout[:500] if stdout else stderr[:500],
                }
                await self._store_checksum_result(host, exit_code == 0, stdout, stderr)
            except Exception:
                results[host] = {"ok": False, "error": "connection failed"}
                logger.error("fix_checksum_failed", host=host, exc_info=True)

        ok_count = sum(1 for r in results.values() if r.get("ok"))
        logger.info("fix_checksum_completed", nodes=len(results), ok=ok_count)
        return {"ok": ok_count == len(results), "nodes_scanned": len(results), "healthy": ok_count, "results": results}

    async def _store_checksum_result(self, host: str, ok: bool, stdout: str, stderr: str):
        try:
            db = await get_db()
            await db.execute(
                "INSERT INTO hardening_checksums (node, ok, output, created_at) VALUES (?, ?, ?, datetime('now'))",
                (host, int(ok), (stdout or stderr)[:2000]),
            )
            await db.commit()
        except Exception:
            pass

    async def deploy_compression(self) -> dict:
        algo = await get_setting("hardening_compression_algorithm", "none")
        level = await get_setting("hardening_compression_level", "3")
        if algo == "none":
            return {"ok": False, "error": "Compression not enabled"}

        results = {}
        for host in settings.all_node_hosts:
            cmd = f"weed volume.configure -compression={algo} -compressionLevel={level} -volumeServer={host}:8080"
            stdout, stderr, exit_code = await self._ssh_exec(host, cmd)
            results[host] = {"ok": exit_code == 0, "output": (stdout or stderr)[:300]}
        return {"ok": all(r.get("ok") for r in results.values()), "results": results}

    async def deploy_encryption(self) -> dict:
        key = await get_setting("hardening_encryption_key", "")
        mode = await get_setting("hardening_encryption_mode", "none")
        if mode == "none" or not key:
            return {"ok": False, "error": "Encryption not configured"}

        results = {}
        for host in settings.all_node_hosts:
            cmd = f"weed volume.configure -encryptVolumeKey={key} -volumeServer={host}:8080"
            stdout, stderr, exit_code = await self._ssh_exec(host, cmd)
            results[host] = {"ok": exit_code == 0, "output": (stdout or stderr)[:300]}
        return {"ok": all(r.get("ok") for r in results.values()), "results": results}

    async def check_replication_drift(self) -> dict:
        from app.services.seaweed_client import get_seaweed_client
        client = get_seaweed_client()
        try:
            resp = await client.master_get("/dir/status?pretty=y")
            data = resp.json()
        except Exception:
            return {"ok": False, "error": "topology fetch failed"}

        desired_repl = await get_setting("hardening_replication_factor", "001")
        layouts = data.get("Topology", {}).get("Layouts", [])
        if layouts:
            current_repl = layouts[0].get("replication", "")
        else:
            current_repl = ""
        topology = data.get("Topology", {})
        volume_count = 0
        for dc in topology.get("DataCenters", []):
            for rack in dc.get("Racks", []):
                for node in rack.get("DataNodes", []):
                    volume_count += node.get("Volumes", 0)

        drifted = current_repl and current_repl != desired_repl
        return {
            "ok": not drifted,
            "desired_replication": desired_repl,
            "current_replication": current_repl or "unknown",
            "drifted": drifted,
            "total_volumes": volume_count,
        }

    @staticmethod
    async def verify_checksums_one() -> dict:
        service = await _ensure_service()
        return await service.verify_checksums_all()

    def _update_heartbeat(self):
        asyncio.create_task(self._write_heartbeat())

    async def _write_heartbeat(self):
        try:
            db = await get_db()
            await db.execute(
                "INSERT OR REPLACE INTO services_health (name, last_heartbeat, ttl_seconds) VALUES (?, datetime('now'), ?)",
                ("hardening_service", 7200),
            )
            await db.commit()
        except Exception:
            pass


async def _ensure_service() -> HardeningService:
    global _eval_task
    svc = HardeningService()
    if not _eval_task or _eval_task.done():
        await svc.start()
    return svc


_hardening_service: HardeningService | None = None


def get_hardening_service() -> HardeningService:
    global _hardening_service
    if _hardening_service is None:
        _hardening_service = HardeningService()
    return _hardening_service


async def start_hardening_service():
    await get_hardening_service().start()


async def stop_hardening_service():
    global _hardening_service
    if _hardening_service:
        await _hardening_service.stop()
        _hardening_service = None
