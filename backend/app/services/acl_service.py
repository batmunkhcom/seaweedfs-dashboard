from app.database import get_db
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
