import asyncio
import time

import httpx

from app.config import settings
from app.database import get_db
from app.services.seaweed_client import get_seaweed_client
from app.settings_service import get_setting_int, get_setting
from app.logging_config import get_logger

logger = get_logger("metrics_service")

_collect_task: asyncio.Task | None = None
_last_restart_at: float = 0
_instance_count = 0


class MetricsService:
    def __init__(self):
        global _instance_count
        _instance_count += 1
        self._running = False
        self._client = get_seaweed_client()

    async def start(self):
        global _collect_task, _last_restart_at

        enabled_str = await get_setting("metrics_enabled", "true")
        if enabled_str != "true":
            logger.info("metrics_service_disabled")
            return

        now = time.time()
        if now - _last_restart_at < 300:
            logger.warning("metrics_service_restart_cooldown", last=_last_restart_at)
            return
        _last_restart_at = now

        if _collect_task and not _collect_task.done():
            _collect_task.cancel()
            try:
                await _collect_task
            except asyncio.CancelledError:
                pass

        self._running = True
        _collect_task = asyncio.create_task(self._collect_loop())
        self._update_heartbeat()
        logger.info("metrics_service_started")

    async def stop(self):
        self._running = False
        global _collect_task, _instance_count
        _instance_count -= 1
        if _collect_task and not _collect_task.done():
            _collect_task.cancel()
            try:
                await _collect_task
            except asyncio.CancelledError:
                pass
        logger.info("metrics_service_stopped")

    async def _collect_loop(self):
        while self._running:
            try:
                await self._collect_and_store()
                self._update_heartbeat()
            except Exception:
                logger.error("metrics_collect_failed", exc_info=True)
            try:
                interval = await get_setting_int("metrics_poll_interval_seconds", 60)
            except Exception:
                logger.error("metrics_interval_load_failed", exc_info=True)
                interval = 60
            await asyncio.sleep(interval)

    async def _collect_and_store(self):
        try:
            resp = await self._client.master_get("/dir/status?pretty=y")
            data = resp.json()
        except Exception:
            logger.error("metrics_topology_fetch_failed", exc_info=True)
            return

        topology = data.get("Topology", {})
        ts = time.time()
        node_ips: list[str] = []

        for dc in topology.get("DataCenters", []):
            for rack in dc.get("Racks", []):
                for node in rack.get("DataNodes", []):
                    node_url = node.get("Url", "")
                    node_ip = node_url.split(":")[0] if node_url else "unknown"
                    node_ips.append(node_ip)

        rows_to_insert: list[tuple] = []
        disk_usage_by_ip: dict[str, float] = {}
        disk_total_by_ip: dict[str, float] = {}
        disk_free_by_ip: dict[str, float] = {}

        timeout = httpx.Timeout(5.0, connect=3.0)
        async with httpx.AsyncClient(timeout=timeout) as hc:
            for node_ip in node_ips:
                percent_used = 0.0
                disk_total = 0.0
                disk_free = 0.0
                try:
                    r = await hc.get(f"http://{node_ip}:8080/status")
                    if r.status_code == 200:
                        status = r.json()
                        for ds in status.get("DiskStatuses", []):
                            all_bytes = ds.get("all", 0)
                            free_bytes = ds.get("free", 0)
                            pct = ds.get("percent_used", 0)
                            disk_total += all_bytes
                            disk_free += free_bytes
                            if pct > percent_used:
                                percent_used = pct
                except Exception:
                    logger.warning("metrics_disk_status_failed", node=node_ip, exc_info=True)

                disk_usage_by_ip[node_ip] = round(percent_used, 2)
                disk_total_by_ip[node_ip] = round(disk_total / (1024**3), 1)
                disk_free_by_ip[node_ip] = round(disk_free / (1024**3), 1)

        for dc in topology.get("DataCenters", []):
            for rack in dc.get("Racks", []):
                for node in rack.get("DataNodes", []):
                    node_url = node.get("Url", "")
                    node_ip = node_url.split(":")[0] if node_url else "unknown"
                    volumes = node.get("Volumes", 0)
                    free = node.get("Free", 0)
                    max_slots = node.get("Max", 0)
                    ec_shards = node.get("EcShards", 0)

                    rows_to_insert.append((ts, node_ip, "volumes", volumes))
                    rows_to_insert.append((ts, node_ip, "free_slots", free))
                    rows_to_insert.append((ts, node_ip, "max_slots", max_slots))
                    rows_to_insert.append((ts, node_ip, "ec_shards", ec_shards))
                    rows_to_insert.append((ts, node_ip, "disk_usage_pct", disk_usage_by_ip.get(node_ip, 0.0)))
                    rows_to_insert.append((ts, node_ip, "disk_total_gb", disk_total_by_ip.get(node_ip, 0.0)))
                    rows_to_insert.append((ts, node_ip, "disk_free_gb", disk_free_by_ip.get(node_ip, 0.0)))

        if rows_to_insert:
            try:
                db = await get_db()
                await db.executemany(
                    "INSERT INTO metrics_history (timestamp, node, metric_type, value) VALUES (?, ?, ?, ?)",
                    rows_to_insert,
                )
                await db.commit()

                retention = await get_setting_int("metrics_retention_days", 30)
                cutoff = time.time() - (retention * 86400)
                await db.execute("DELETE FROM metrics_history WHERE timestamp < ?", (cutoff,))
                await db.commit()
            except Exception:
                logger.error("metrics_db_write_failed", exc_info=True)

        try:
            from app.routes.sse import broadcast
            await broadcast("metrics_update", {"last_updated": ts})
        except Exception:
            pass

    def _update_heartbeat(self):
        asyncio.create_task(self._write_heartbeat())

    async def _write_heartbeat(self):
        try:
            db = await get_db()
            await db.execute(
                "INSERT OR REPLACE INTO services_health (name, last_heartbeat, ttl_seconds) VALUES (?, datetime('now'), ?)",
                ("metrics_service", 120),
            )
            await db.commit()
        except Exception:
            pass


_metrics_service: MetricsService | None = None


def get_metrics_service() -> MetricsService:
    global _metrics_service
    if _metrics_service is None:
        _metrics_service = MetricsService()
    return _metrics_service


async def start_metrics_service():
    await get_metrics_service().start()


async def stop_metrics_service():
    global _metrics_service
    if _metrics_service:
        await _metrics_service.stop()
        _metrics_service = None
