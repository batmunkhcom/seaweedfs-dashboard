from app.database import get_db
from app.services.seaweed_client import get_seaweed_client
from app.logging_config import get_logger

logger = get_logger("acl_service")

PERMISSIONS = ["R", "W", "D", "L", "A"]
PERMISSION_LABELS = {"R": "Read", "W": "Write", "D": "Delete", "L": "List", "A": "Admin"}


async def get_policies() -> list[dict]:
    db = await get_db()
    cursor = await db.execute("SELECT * FROM acl_policies WHERE enabled=1 ORDER BY priority ASC, id ASC")
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def create_policy(name: str, path: str = "/", user_pattern: str = "*",
                        permissions: str = "R", description: str = "", priority: int = 0) -> dict:
    db = await get_db()
    cursor = await db.execute(
        "INSERT INTO acl_policies (name, description, path, user_pattern, permissions, priority) VALUES (?, ?, ?, ?, ?, ?)",
        (name, description, path, user_pattern, permissions.upper(), priority),
    )
    await db.commit()
    logger.info("acl_policy_created", name=name, id=cursor.lastrowid)
    return {"ok": True, "id": cursor.lastrowid}


async def update_policy(policy_id: int, **kwargs) -> dict:
    db = await get_db()
    existing = await db.execute("SELECT id FROM acl_policies WHERE id=?", (policy_id,))
    if not await existing.fetchone():
        return {"ok": False, "error": "Policy not found"}

    updates = {}
    for key in ["name", "description", "path", "user_pattern", "permissions", "priority", "enabled"]:
        if key in kwargs and kwargs[key] is not None:
            updates[key] = kwargs[key]
    if "permissions" in updates:
        updates["permissions"] = updates["permissions"].upper()

    if updates:
        updates["updated_at"] = "datetime('now')"
        set_clause = ", ".join(f"{k}=?" for k in updates)
        vals = list(updates.values()) + [policy_id]
        await db.execute(f"UPDATE acl_policies SET {set_clause} WHERE id=?", vals)
        await db.commit()

    return {"ok": True}


async def delete_policy(policy_id: int) -> dict:
    db = await get_db()
    await db.execute("UPDATE acl_policies SET enabled=0 WHERE id=?", (policy_id,))
    await db.commit()
    return {"ok": True}


async def reorder_policies(order: list[int]) -> dict:
    db = await get_db()
    for i, pid in enumerate(order):
        await db.execute("UPDATE acl_policies SET priority=? WHERE id=?", (i, pid))
    await db.commit()
    return {"ok": True}


async def test_permission(user: str, path: str, action: str) -> dict:
    db = await get_db()
    cursor = await db.execute(
        "SELECT * FROM acl_policies WHERE enabled=1 ORDER BY priority ASC, id ASC"
    )
    rows = await cursor.fetchall()

    matched_rule = None
    for row in rows:
        pattern = row["user_pattern"]
        rule_path = row["path"]
        if pattern != "*" and pattern != user:
            continue
        if rule_path != "/" and not path.startswith(rule_path.rstrip("*")):
            continue
        if action.upper() in (row["permissions"] or "").upper():
            matched_rule = dict(row)
            break

    allowed = matched_rule is not None
    await db.execute(
        "INSERT INTO acl_audit_log (user_name, action, path, result, details) VALUES (?, ?, ?, ?, ?)",
        (user, action, path, "allowed" if allowed else "denied",
         f"Rule: {matched_rule['name']}" if matched_rule else "No matching rule"),
    )
    await db.commit()

    return {
        "user": user, "path": path, "action": action,
        "allowed": allowed,
        "matched_rule": matched_rule["name"] if matched_rule else None,
    }


async def get_audit_log(user: str | None = None, limit: int = 50) -> list[dict]:
    db = await get_db()
    if user:
        cursor = await db.execute(
            "SELECT * FROM acl_audit_log WHERE user_name=? ORDER BY created_at DESC LIMIT ?",
            (user, limit),
        )
    else:
        cursor = await db.execute("SELECT * FROM acl_audit_log ORDER BY created_at DESC LIMIT ?", (limit,))
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def build_filer_acl_rules() -> list[dict]:
    policies = await get_policies()
    rules = []
    for p in policies:
        rules.append({
            "user": p.get("user_pattern", "*"),
            "path": p.get("path", "/"),
            "permissions": p.get("permissions", "R"),
        })
    return rules


async def push_acl_to_filer():
    rules = await build_filer_acl_rules()
    client = get_seaweed_client()
    import json
    payload = json.dumps(rules)

    filer_hosts = ["172.16.0.2:8888", "172.16.0.4:8888"]
    results = {}
    for host in filer_hosts:
        try:
            resp = await client.client.put(
                f"http://{host}/admin/acl",
                content=payload,
                headers={"Content-Type": "application/json"},
                timeout=10,
            )
            ok = resp.status_code in (200, 204)
            results[host] = {"ok": ok, "status": resp.status_code}
            logger.info("acl_sync", host=host, ok=ok, status=resp.status_code)
        except Exception as e:
            results[host] = {"ok": False, "error": str(e)}
            logger.error("acl_sync_failed", host=host, exc_info=True)

    await _update_sync_status(rules, results)
    return {"ok": all(r.get("ok") for r in results.values()), "results": results}


async def _update_sync_status(rules: list[dict], results: dict):
    try:
        db = await get_db()
        ok = all(r.get("ok") for r in results.values())
        sync_status = "synced" if ok else "partial"
        await db.execute(
            "INSERT OR REPLACE INTO acl_sync_status (id, status, rule_count, last_sync_at, details) VALUES (1, ?, ?, datetime('now'), ?)",
            (sync_status, len(rules), str(results)),
        )
        await db.commit()
    except Exception:
        pass


async def get_sync_status() -> dict:
    try:
        db = await get_db()
        cursor = await db.execute("SELECT * FROM acl_sync_status WHERE id=1")
        row = await cursor.fetchone()
        if row:
            return dict(row)
    except Exception:
        pass
    return {"status": "never_synced", "rule_count": 0, "last_sync_at": None}


async def auto_sync_on_change():
    try:
        await push_acl_to_filer()
    except Exception:
        logger.error("acl_auto_sync_failed", exc_info=True)
