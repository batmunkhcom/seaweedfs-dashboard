import json
import time

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from app.database import get_db
from app.middleware.auth_middleware import require_admin
from app.services.webhook_service import (
    get_webhook_service, publish_webhook_event, build_payload,
    WEBHOOK_SUPPORTED_EVENTS,
)
from app.logging_config import get_logger

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
logger = get_logger("webhooks")


class CreateBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    platform: str = "generic"
    url: str = Field(..., min_length=5)
    events: list[str] = Field(default_factory=list)
    secret: str = ""


class UpdateBody(BaseModel):
    name: str | None = None
    platform: str | None = None
    url: str | None = None
    events: list[str] | None = None
    secret: str | None = None


@router.get("")
async def list_webhooks():
    db = await get_db()
    cursor = await db.execute("SELECT * FROM webhooks ORDER BY created_at DESC")
    rows = await cursor.fetchall()
    return [{
        "id": r["id"], "name": r["name"], "platform": r["platform"],
        "url": r["url"], "events": [e.strip() for e in (r["events"] or "").split(",") if e.strip()],
        "enabled": bool(r["enabled"]),
        "created_at": r["created_at"], "updated_at": r["updated_at"],
    } for r in rows]


@router.post("")
async def create_webhook(body: CreateBody, _: bool = Depends(require_admin)):
    db = await get_db()
    cursor = await db.execute(
        "INSERT INTO webhooks (name, platform, url, events, secret) VALUES (?, ?, ?, ?, ?)",
        (body.name, body.platform, body.url, ",".join(body.events), body.secret),
    )
    await db.commit()
    webhook_id = cursor.lastrowid
    logger.info("webhook_created", id=webhook_id, name=body.name, platform=body.platform)
    return {"ok": True, "id": webhook_id}


@router.put("/{webhook_id}")
async def update_webhook(webhook_id: int, body: UpdateBody, _: bool = Depends(require_admin)):
    db = await get_db()
    existing = await db.execute("SELECT id FROM webhooks WHERE id = ?", (webhook_id,))
    if not await existing.fetchone():
        raise HTTPException(404, "Webhook not found")

    updates = {}
    if body.name is not None:
        updates["name"] = body.name
    if body.platform is not None:
        updates["platform"] = body.platform
    if body.url is not None:
        updates["url"] = body.url
    if body.events is not None:
        updates["events"] = ",".join(body.events)
    if body.secret is not None:
        updates["secret"] = body.secret

    if updates:
        updates["updated_at"] = "datetime('now')"
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        vals = list(updates.values())
        vals.append(webhook_id)
        await db.execute(f"UPDATE webhooks SET {set_clause} WHERE id = ?", vals)
        await db.commit()

    logger.info("webhook_updated", id=webhook_id)
    return {"ok": True}


@router.delete("/{webhook_id}")
async def delete_webhook(webhook_id: int, _: bool = Depends(require_admin)):
    db = await get_db()
    await db.execute("DELETE FROM webhooks WHERE id = ?", (webhook_id,))
    await db.execute("DELETE FROM webhook_deliveries WHERE webhook_id = ?", (webhook_id,))
    await db.commit()
    logger.info("webhook_deleted", id=webhook_id)
    return {"ok": True}


@router.post("/{webhook_id}/test")
async def test_webhook(webhook_id: int, _: bool = Depends(require_admin)):
    db = await get_db()
    cursor = await db.execute("SELECT * FROM webhooks WHERE id = ?", (webhook_id,))
    wh = await cursor.fetchone()
    if not wh:
        raise HTTPException(404, "Webhook not found")

    test_data = {"test": True, "message": f"Test webhook from SeaweedFS Dashboard — {wh['name']}"}
    payload = build_payload(wh["platform"], "test_event", test_data)

    try:
        await publish_webhook_event("test_event", test_data)
        svc = get_webhook_service()
        import asyncio
        await asyncio.sleep(2)
    except Exception:
        pass

    return {"ok": True, "message": "Test triggered — check delivery log"}


@router.get("/{webhook_id}/history")
async def webhook_history(webhook_id: int, limit: int = 50):
    db = await get_db()
    cursor = await db.execute(
        "SELECT * FROM webhook_deliveries WHERE webhook_id = ? ORDER BY created_at DESC LIMIT ?",
        (webhook_id, limit),
    )
    rows = await cursor.fetchall()
    return [{
        "id": r["id"], "webhook_id": r["webhook_id"], "event": r["event"],
        "status": r["status"], "request_body": r["request_body"] if r["status"] != "success" else "",
        "response_code": r["response_code"], "response_body": r["response_body"] if r["status"] != "success" else "",
        "error": r["error"], "duration_ms": r["duration_ms"], "created_at": r["created_at"],
    } for r in rows]


@router.get("/{webhook_id}/history/{delivery_id}")
async def webhook_delivery_detail(webhook_id: int, delivery_id: int):
    db = await get_db()
    cursor = await db.execute(
        "SELECT * FROM webhook_deliveries WHERE webhook_id = ? AND id = ?",
        (webhook_id, delivery_id),
    )
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "Delivery not found")
    return {
        "id": row["id"], "webhook_id": row["webhook_id"], "event": row["event"],
        "status": row["status"], "request_body": row["request_body"],
        "response_code": row["response_code"], "response_body": row["response_body"],
        "error": row["error"], "duration_ms": row["duration_ms"], "created_at": row["created_at"],
    }


@router.put("/{webhook_id}/toggle")
async def toggle_webhook(webhook_id: int, _: bool = Depends(require_admin)):
    db = await get_db()
    await db.execute("UPDATE webhooks SET enabled = CASE WHEN enabled = 1 THEN 0 ELSE 1 END WHERE id = ?", (webhook_id,))
    await db.commit()
    cursor = await db.execute("SELECT enabled FROM webhooks WHERE id = ?", (webhook_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "Webhook not found")
    return {"ok": True, "enabled": bool(row["enabled"])}


@router.get("/templates")
async def get_templates():
    return {
        "platforms": [
            {"value": "slack", "label": "Slack", "icon": "slack",
             "description": "Slack incoming webhook. Create an app → activate Incoming Webhooks → copy URL."},
            {"value": "discord", "label": "Discord", "icon": "discord",
             "description": "Discord channel webhook. Channel settings → Integrations → Webhooks → copy URL."},
            {"value": "email", "label": "Email", "icon": "email",
             "description": "SMTP relay or service like SendGrid/Mailgun."},
            {"value": "generic", "label": "Generic HTTP", "icon": "http",
             "description": "Any HTTP endpoint. POST with JSON body + optional HMAC-SHA256 signature."},
        ],
        "events": [
            {"value": e, "label": e.replace("_", " ").title()} for e in WEBHOOK_SUPPORTED_EVENTS
        ],
    }
