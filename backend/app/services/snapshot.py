import asyncio
import time
import json


from app.database import get_db
from app.services.seaweed_client import get_seaweed_client
from app.settings_service import get_setting_int
from app.logging_config import get_logger

logger = get_logger("snapshot_service")

_eval_task: asyncio.Task | None = None
_last_restart_at: float = 0
_instance_count = 0


class SnapshotService:
    def __init__(self):
        global _instance_count
        _instance_count += 1
        self._running = False
        self._client = get_seaweed_client()

    async def start(self):
        global _eval_task, _last_restart_at
        now = time.time()
        if now - _last_restart_at < 300:
            logger.warning("snapshot_restart_cooldown", last=_last_restart_at)
            return
        _last_restart_at = now

        if _eval_task and not _eval_task.done():
            _eval_task.cancel()
            try:
                await _eval_task
            except asyncio.CancelledError:
                pass

        self._running = True
        interval = await get_setting_int("snapshot_interval_seconds", 60)
        _eval_task = asyncio.create_task(self._poll_loop(interval))
        self._update_heartbeat()
        logger.info("snapshot_service_started", interval=interval)

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
        logger.info("snapshot_service_stopped")

    async def _poll_loop(self, interval: int):
        while self._running:
            try:
                await self._collect_and_store()
                self._update_heartbeat()
            except Exception:
                logger.error("snapshot_collect_failed", exc_info=True)
            await asyncio.sleep(interval)

    async def _collect_and_store(self):
        stats = {
            "totalVolumes": 0,
            "totalFiles": 0,
            "totalSizeBytes": 0,
            "freeSpace": 0,
            "maxSpace": 0,
            "volumeServers": 0,
            "healthyNodes": 0,
            "masterLeader": "",
            "filerStatus": "disconnected",
            "version": "",
            "remoteSizeBytes": 0,
        }

        try:
            resp = await self._client.master_get("/dir/status?pretty=y")
            topology_data = resp.json()
        except Exception:
            logger.error("snapshot_topology_failed", exc_info=True)
            return

        topology = topology_data.get("Topology", {})
        topology_data.get("VolumeSizeLimit", 30 * 1024) / (1024 * 1024)

        for dc in topology.get("DataCenters", []):
            for rack in dc.get("Racks", []):
                for node in rack.get("DataNodes", []):
                    stats["maxSpace"] += node.get("Max", 0)
                    stats["freeSpace"] += node.get("Free", 0)
                    stats["volumeServers"] += 1
                    stats["totalVolumes"] += node.get("Volumes", 0)
                    stats["healthyNodes"] += 1

        try:
            leader_resp = await self._client.master_get("/cluster/status")
            leader_data = leader_resp.json()
            stats["masterLeader"] = leader_data.get("Leader", "")
        except Exception:
            pass

        try:
            filer_client = await self._client.get_filer()
            r = await filer_client.get(f"http://{self._client._filer_host}/?stats")
            if r.status_code == 200:
                fs = r.json()
                stats["totalFiles"] = fs.get("Total", 0)
                stats["remoteSizeBytes"] = fs.get("Disk", {}).get("Used", 0)
        except Exception:
            pass
        else:
            stats["filerStatus"] = "connected"

        try:
            stats["version"] = topology_data.get("Version", "")
        except Exception:
            pass

        await self._store(stats)

    async def _store(self, stats: dict):
        try:
            db = await get_db()
            await db.execute(
                "INSERT INTO snapshots (timestamp, total_volumes, total_files, total_size_bytes, free_space, max_space, volume_servers, healthy_nodes, master_leader, json_raw) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    time.time(),
                    stats["totalVolumes"],
                    stats.get("totalFiles", 0),
                    stats.get("remoteSizeBytes", 0) or stats.get("totalSizeBytes", 0),
                    stats["freeSpace"],
                    stats["maxSpace"],
                    stats["volumeServers"],
                    stats["healthyNodes"],
                    stats["masterLeader"],
                    json.dumps(stats),
                ),
            )
            await db.commit()

            retention_days = await get_setting_int("snapshot_retention_days", 30)
            cutoff = time.time() - retention_days * 86400
            await db.execute("DELETE FROM snapshots WHERE timestamp < ?", (cutoff,))
            await db.commit()
        except Exception:
            logger.error("snapshot_store_failed", exc_info=True)

    def _update_heartbeat(self):
        asyncio.create_task(self._write_heartbeat())

    async def _write_heartbeat(self):
        try:
            db = await get_db()
            await db.execute(
                "INSERT OR REPLACE INTO services_health (name, last_heartbeat, ttl_seconds) VALUES (?, datetime('now'), ?)",
                ("snapshot_service", 300),
            )
            await db.commit()
        except Exception:
            pass


_snapshot_service: SnapshotService | None = None


def get_snapshot_service() -> SnapshotService:
    global _snapshot_service
    if _snapshot_service is None:
        _snapshot_service = SnapshotService()
    return _snapshot_service


async def start_snapshot_service():
    await get_snapshot_service().start()


async def stop_snapshot_service():
    global _snapshot_service
    if _snapshot_service:
        await _snapshot_service.stop()
        _snapshot_service = None
