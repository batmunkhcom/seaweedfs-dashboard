from fastapi import APIRouter, Depends, HTTPException

from app.database import get_db
from app.middleware.auth_middleware import get_current_user, require_admin
from app.logging_config import get_logger

router = APIRouter(prefix="/feedback", tags=["feedback"])
logger = get_logger("feedback")


@router.get("/requests")
async def list_requests(status: str | None = None, category: str | None = None):
    db = await get_db()
    query = "SELECT * FROM feature_requests"
    params = []
    conditions = []
    if status:
        conditions.append("status = ?")
        params.append(status)
    if category:
        conditions.append("category = ?")
        params.append(category)
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY votes DESC, created_at DESC"

    cursor = await db.execute(query, params)
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


@router.post("/requests")
async def create_request(body: dict, user: dict = Depends(get_current_user)):
    db = await get_db()
    cursor = await db.execute(
        "INSERT INTO feature_requests (title, description, category, created_by) VALUES (?, ?, ?, ?)",
        (body.get("title", ""), body.get("description", ""), body.get("category", "feature"), user["username"]),
    )
    await db.commit()
    return {"ok": True, "id": cursor.lastrowid}


@router.post("/requests/{request_id}/vote")
async def vote(request_id: int, user: dict = Depends(get_current_user)):
    db = await get_db()
    try:
        await db.execute(
            "INSERT OR IGNORE INTO feature_votes (request_id, username) VALUES (?, ?)",
            (request_id, user["username"]),
        )
        await db.execute(
            "UPDATE feature_requests SET votes = (SELECT COUNT(*) FROM feature_votes WHERE request_id = ?) WHERE id = ?",
            (request_id, request_id),
        )
        await db.commit()
        return {"ok": True}
    except Exception:
        return {"ok": True}


@router.delete("/requests/{request_id}/vote")
async def unvote(request_id: int, user: dict = Depends(get_current_user)):
    db = await get_db()
    await db.execute(
        "DELETE FROM feature_votes WHERE request_id = ? AND username = ?",
        (request_id, user["username"]),
    )
    await db.execute(
        "UPDATE feature_requests SET votes = (SELECT COUNT(*) FROM feature_votes WHERE request_id = ?) WHERE id = ?",
        (request_id, request_id),
    )
    await db.commit()
    return {"ok": True}


@router.put("/requests/{request_id}/status")
async def update_status(request_id: int, body: dict, _: bool = Depends(require_admin)):
    db = await get_db()
    await db.execute(
        "UPDATE feature_requests SET status = ?, updated_at = datetime('now') WHERE id = ?",
        (body.get("status", "under_review"), request_id),
    )
    await db.commit()
    return {"ok": True}


@router.post("/requests/{request_id}/comments")
async def add_comment(request_id: int, body: dict, user: dict = Depends(get_current_user)):
    db = await get_db()
    await db.execute(
        "INSERT INTO feature_comments (request_id, author, body) VALUES (?, ?, ?)",
        (request_id, user["username"], body.get("body", "")),
    )
    await db.commit()
    return {"ok": True}


@router.get("/requests/{request_id}")
async def get_request(request_id: int):
    db = await get_db()
    cursor = await db.execute("SELECT * FROM feature_requests WHERE id = ?", (request_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "Not found")

    comments_cursor = await db.execute(
        "SELECT * FROM feature_comments WHERE request_id = ? ORDER BY created_at ASC",
        (request_id,),
    )
    comments = [dict(c) for c in await comments_cursor.fetchall()]

    return {**dict(row), "comments": comments}
