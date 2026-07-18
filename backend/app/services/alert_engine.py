import asyncio
import time

import httpx

from app.config import settings
from app.database import get_db
from app.services.seaweed_client import get_seaweed_client
from app.settings_service import get_setting_int, get_setting
from app.logging_config import get_logger

logger = get_logger("alert_engine")

_eval_task: asyncio.Task | None = None
_last_restart_at: float = 0
_instance_count = 0


class AlertEngine:
    def __init__(self):
        global _instance_count
        _instance_count += 1
        self._running = False
        self._client = get_seaweed_client()

    async def start(self):
        global _eval_task, _last_restart_at

        now = time.time()
        if now - _last_restart_at < 300:
            logger.warning("alert_engine_restart_cooldown", last=_last_restart_at)
            return
        _last_restart_at = now

        if _eval_task and not _eval_task.done():
            _eval_task.cancel()
            try:
                await _eval_task
            except asyncio.CancelledError:
                pass

        self._running = True
        _eval_task = asyncio.create_task(self._eval_loop())
        self._update_heartbeat()
        logger.info("alert_engine_started")

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
        logger.info("alert_engine_stopped")

    async def _eval_loop(self):
        while self._running:
            try:
                await self._evaluate_thresholds()
                self._update_heartbeat()
            except Exception:
                logger.error("alert_eval_failed", exc_info=True)
            await asyncio.sleep(60)

    async def _evaluate_thresholds(self):
        disk_pct = await get_setting_int("alert_disk_usage_pct", 90)
        max_readonly = await get_setting_int("alert_max_readonly_volumes", 3)
        garbage_ratio = 0.5
        try:
            garbage_ratio = float(await get_setting("alert_garbage_ratio", "0.5"))
        except ValueError:
            pass

        topology_data = None
        try:
            resp = await self._client.master_get("/dir/status?pretty=y")
            topology_data = resp.json()
        except Exception:
            logger.error("alert_topology_fetch_failed", exc_info=True)
            return

        topology = topology_data.get("Topology", {})

        for dc in topology.get("DataCenters", []):
            for rack in dc.get("Racks", []):
                for node in rack.get("DataNodes", []):
                    node_url = node.get("Url", "")
                    node_ip = node_url.split(":")[0] if node_url else "unknown"

                    self._check_node_disk(node_ip, node, disk_pct)
                    self._check_node_alive(node_ip)
                    self._check_readonly_volumes(node_ip, node, max_readonly)

    def _check_node_disk(self, node_ip: str, node: dict, threshold: int):
        dedup_key = f"disk_usage:{node_ip}"
        asyncio.create_task(self._fetch_real_disk_and_alert(node_ip, threshold, dedup_key))

    async def _fetch_real_disk_and_alert(self, node_ip: str, threshold: int, dedup_key: str):
        percent_used = 0.0
        try:
            async with httpx.AsyncClient(timeout=5) as hc:
                r = await hc.get(f"http://{node_ip}:8080/status")
                if r.status_code == 200:
                    data = r.json()
                    for ds in data.get("DiskStatuses", []):
                        pct = ds.get("percent_used", 0)
                        if pct > percent_used:
                            percent_used = pct
        except Exception:
            percent_used = 0.0

        percent_used = round(percent_used, 2)

        if percent_used > threshold:
            severity = "critical" if percent_used > 95 else "warning"
            await self._create_alert(
                "disk_usage", severity,
                f"Disk usage {percent_used}% on {node_ip}",
                f"Threshold: {threshold}%, current: {percent_used}%",
                node_ip, dedup_key,
            )
            await self._publish_webhook(f"disk_{severity}", {"node": node_ip, "usage_pct": percent_used, "threshold": threshold})
        else:
            await self._resolve_alert(dedup_key)

    def _check_node_alive(self, node_ip: str):
        dedup_key = f"node_down:{node_ip}"
        asyncio.create_task(self._ping_and_alert(node_ip, dedup_key))

    async def _ping_and_alert(self, node_ip: str, dedup_key: str):
        try:
            async with httpx.AsyncClient(timeout=5) as hc:
                r = await hc.get(f"http://{node_ip}:8080/status")
                if r.status_code == 200:
                    if await self._resolve_alert(dedup_key):
                        await self._publish_webhook("node_up", {"node": node_ip})
                else:
                    await self._create_alert(
                        "node_down", "critical",
                        f"Node {node_ip} is unreachable",
                        f"HTTP {r.status_code} on port 8080",
                        node_ip, dedup_key,
                    )
                    await self._publish_webhook("node_down", {"node": node_ip})
        except Exception:
            await self._create_alert(
                "node_down", "critical",
                f"Node {node_ip} is down",
                "Connection refused on port 8080",
                node_ip, dedup_key,
            )
            await self._publish_webhook("node_down", {"node": node_ip})

    def _check_readonly_volumes(self, node_ip: str, node: dict, max_allowed: int):
        try:
            asyncio.create_task(self._count_readonly(node_ip, node, max_allowed))
        except Exception:
            pass

    async def _count_readonly(self, node_ip: str, node: dict, max_allowed: int):
        try:
            r = await self._client.client.get(f"http://{node_ip}:8080/status")
            if r.status_code != 200:
                return
            data = r.json()
            readonly_count = sum(1 for v in data.get("Volumes", []) if v.get("ReadOnly"))
        except Exception:
            return

        dedup_key = f"readonly_volumes:{node_ip}"
        if readonly_count > max_allowed:
            await self._create_alert(
                "readonly_volumes", "warning",
                f"{readonly_count} readonly volumes on {node_ip}",
                f"Max allowed: {max_allowed}, current: {readonly_count}",
                node_ip, dedup_key,
            )
        else:
            await self._resolve_alert(dedup_key)

    async def _create_alert(self, atype: str, severity: str, title: str, description: str,
                            node: str, dedup_key: str):
        try:
            db = await get_db()
            cursor = await db.execute(
                "SELECT id, status FROM alerts WHERE dedup_key = ? AND status != 'resolved' ORDER BY created_at DESC LIMIT 1",
                (dedup_key,),
            )
            existing = await cursor.fetchone()
            if existing:
                return

            await db.execute(
                "INSERT INTO alerts (type, severity, title, description, node, status, dedup_key) VALUES (?, ?, ?, ?, ?, 'new', ?)",
                (atype, severity, title, description, node, dedup_key),
            )
            await db.commit()
            logger.info("alert_created", type=atype, severity=severity, node=node)

            try:
                from app.routes.sse import publish_alert
                await publish_alert({"type": atype, "severity": severity, "title": title, "node": node})
            except Exception:
                pass
        except Exception:
            logger.error("alert_create_failed", exc_info=True)

    async def _resolve_alert(self, dedup_key: str):
        try:
            db = await get_db()
            cursor = await db.execute(
                "SELECT id FROM alerts WHERE dedup_key = ? AND status != 'resolved'",
                (dedup_key,),
            )
            rows = await cursor.fetchall()
            for row in rows:
                await db.execute(
                    "UPDATE alerts SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP WHERE id = ?",
                    (row["id"],),
                )
            if rows:
                await db.commit()
                logger.info("alert_resolved", dedup_key=dedup_key, count=len(rows))
                return True
            return False
        except Exception:
            return False

    async def _publish_webhook(self, event_type: str, data: dict):
        try:
            from app.services.webhook_service import publish_webhook_event
            await publish_webhook_event(event_type, data)
        except Exception:
            pass

    def _update_heartbeat(self):
        asyncio.create_task(self._write_heartbeat())

    async def _write_heartbeat(self):
        try:
            db = await get_db()
            await db.execute(
                "INSERT OR REPLACE INTO services_health (name, last_heartbeat, ttl_seconds) VALUES (?, datetime('now'), ?)",
                ("alert_engine", 120),
            )
            await db.commit()
        except Exception:
            pass


_alert_engine: AlertEngine | None = None


def get_alert_engine() -> AlertEngine:
    global _alert_engine
    if _alert_engine is None:
        _alert_engine = AlertEngine()
    return _alert_engine


async def start_alert_engine():
    await get_alert_engine().start()


async def stop_alert_engine():
    global _alert_engine
    if _alert_engine:
        await _alert_engine.stop()
        _alert_engine = None
