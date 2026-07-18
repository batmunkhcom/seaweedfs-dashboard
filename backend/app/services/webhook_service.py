import asyncio
import hashlib
import hmac
import json
import time

import httpx

from app.database import get_db
from app.settings_service import get_setting_int, get_setting
from app.logging_config import get_logger

logger = get_logger("webhook_service")

_dispatch_task: asyncio.Task | None = None
_last_restart_at: float = 0
_instance_count = 0

WEBHOOK_SUPPORTED_EVENTS = [
    "alert_created", "alert_resolved",
    "backup_completed", "backup_failed",
    "disk_warning", "disk_critical",
    "node_down", "node_up",
]

SLACK_TEMPLATE = {
    "text": "{title}",
    "blocks": [
        {"type": "header", "text": {"type": "plain_text", "text": "{title}"}},
        {"type": "section", "text": {"type": "mrkdwn", "text": "{description}"}},
        {"type": "context", "elements": [{"type": "mrkdwn", "text": "{footer}"}]},
    ],
}

DISCORD_TEMPLATE = {
    "embeds": [{
        "title": "{title}",
        "description": "{description}",
        "color": 7506394,
        "footer": {"text": "{footer}"},
        "timestamp": "{timestamp}",
    }],
}


def build_payload(platform: str, event: str, data: dict) -> dict:
    title = f"[SeaweedFS] {event}"
    description = json.dumps(data, indent=2) if data else "No additional data"
    timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    footer = f"SeaweedFS Dashboard | {event}"

    if platform == "slack":
        return {
            "text": title,
            "blocks": [
                {"type": "header", "text": {"type": "plain_text", "text": title}},
                {"type": "section", "text": {"type": "mrkdwn", "text": f"```{description}```"}},
                {"type": "context", "elements": [{"type": "mrkdwn", "text": footer}]},
            ],
        }
    elif platform == "discord":
        return {
            "embeds": [{
                "title": title,
                "description": f"```json\n{description}\n```",
                "color": 7506394 if "failed" not in event and "critical" not in event else 15548997,
                "footer": {"text": footer},
                "timestamp": timestamp,
            }],
        }
    else:
        return {"event": event, "data": data, "timestamp": timestamp}


class WebhookService:
    def __init__(self):
        global _instance_count
        _instance_count += 1
        self._running = False
        self._queue: asyncio.Queue = asyncio.Queue(maxsize=256)

    async def start(self):
        global _dispatch_task, _last_restart_at

        enabled_str = await get_setting("webhooks_enabled", "true")
        if enabled_str != "true":
            logger.info("webhook_service_disabled")
            return

        now = time.time()
        if now - _last_restart_at < 300:
            logger.warning("webhook_service_restart_cooldown", last=_last_restart_at)
            return
        _last_restart_at = now

        if _dispatch_task and not _dispatch_task.done():
            _dispatch_task.cancel()
            try:
                await _dispatch_task
            except asyncio.CancelledError:
                pass

        self._running = True
        _dispatch_task = asyncio.create_task(self._dispatch_loop())
        self._update_heartbeat()
        logger.info("webhook_service_started")

    async def stop(self):
        self._running = False
        global _dispatch_task, _instance_count
        _instance_count -= 1
        if _dispatch_task and not _dispatch_task.done():
            _dispatch_task.cancel()
            try:
                await _dispatch_task
            except asyncio.CancelledError:
                pass
        logger.info("webhook_service_stopped")

    async def enqueue(self, event: str, data: dict):
        try:
            self._queue.put_nowait({"event": event, "data": data})
        except asyncio.QueueFull:
            logger.warning("webhook_queue_full", event=event)

    async def _dispatch_loop(self):
        while self._running:
            try:
                item = await asyncio.wait_for(self._queue.get(), timeout=30.0)
                await self._dispatch_event(item["event"], item["data"])
            except asyncio.TimeoutError:
                continue
            except Exception:
                logger.error("webhook_dispatch_loop_failed", exc_info=True)
            self._update_heartbeat()

    async def _dispatch_event(self, event: str, data: dict):
        db = await get_db()
        cursor = await db.execute(
            "SELECT id, name, platform, url, events, secret FROM webhooks WHERE enabled = 1"
        )
        webhooks = await cursor.fetchall()

        for wh in webhooks:
            wh_events = [e.strip() for e in (wh["events"] or "").split(",") if e.strip()]
            if wh_events and event not in wh_events:
                continue

            payload = build_payload(wh["platform"], event, data)
            asyncio.create_task(self._deliver(wh["id"], wh["url"], wh["secret"], event, payload))

    async def _deliver(self, webhook_id: int, url: str, secret: str, event: str, payload: dict):
        delivery_id = await self._create_delivery(webhook_id, event, payload)
        max_retries = await get_setting_int("webhooks_retry_count", 3)
        timeout_secs = await get_setting_int("webhooks_timeout_seconds", 10)
        base_delay = await get_setting_int("webhooks_retry_delay_seconds", 30)

        body = json.dumps(payload).encode()
        headers = {"Content-Type": "application/json"}
        if secret:
            sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
            headers["X-Webhook-Signature"] = f"sha256={sig}"

        for attempt in range(max_retries + 1):
            try:
                t0 = time.monotonic()
                async with httpx.AsyncClient(timeout=timeout_secs) as hc:
                    r = await hc.post(url, content=body, headers=headers)
                duration = round((time.monotonic() - t0) * 1000)

                if 200 <= r.status_code < 300:
                    await self._update_delivery(delivery_id, "success", r.status_code, r.text[:2000], duration)
                    return

                await self._update_delivery(delivery_id, "pending", r.status_code, r.text[:1000], duration)
            except Exception as e:
                await self._update_delivery(delivery_id, "pending", None, "", error=str(e)[:500])

            if attempt < max_retries:
                delay = base_delay * (2 ** attempt)
                await asyncio.sleep(delay)

        await self._update_delivery(delivery_id, "failed", status="error", error="Max retries exceeded")

    async def _create_delivery(self, webhook_id: int, event: str, payload: dict) -> int:
        try:
            db = await get_db()
            cursor = await db.execute(
                "INSERT INTO webhook_deliveries (webhook_id, event, status, request_body) VALUES (?, ?, 'pending', ?)",
                (webhook_id, event, json.dumps(payload)),
            )
            await db.commit()
            return cursor.lastrowid
        except Exception:
            return 0

    async def _update_delivery(self, delivery_id: int, status: str, response_code: int | None = None,
                                response_body: str = "", duration_ms: int | None = None, error: str = ""):
        if not delivery_id:
            return
        try:
            db = await get_db()
            await db.execute(
                "UPDATE webhook_deliveries SET status=?, response_code=?, response_body=?, error=?, duration_ms=? WHERE id=?",
                (status, response_code, response_body, error, duration_ms, delivery_id),
            )
            await db.commit()

            retention = await get_setting_int("webhooks_max_retention_days", 30)
            cutoff = time.time() - (retention * 86400)
            await db.execute("DELETE FROM webhook_deliveries WHERE julianday('now') - julianday(created_at) > ?", (retention,))
            await db.commit()
        except Exception:
            pass

    def _update_heartbeat(self):
        asyncio.create_task(self._write_heartbeat())

    async def _write_heartbeat(self):
        try:
            db = await get_db()
            await db.execute(
                "INSERT OR REPLACE INTO services_health (name, last_heartbeat, ttl_seconds) VALUES (?, datetime('now'), ?)",
                ("webhook_service", 120),
            )
            await db.commit()
        except Exception:
            pass


_webhook_service: WebhookService | None = None


def get_webhook_service() -> WebhookService:
    global _webhook_service
    if _webhook_service is None:
        _webhook_service = WebhookService()
    return _webhook_service


async def publish_webhook_event(event: str, data: dict):
    try:
        svc = get_webhook_service()
        if svc._running:
            await svc.enqueue(event, data)
    except Exception:
        pass


async def start_webhook_service():
    await get_webhook_service().start()


async def stop_webhook_service():
    global _webhook_service
    if _webhook_service:
        await _webhook_service.stop()
        _webhook_service = None
