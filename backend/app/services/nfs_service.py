import asyncio
import os

import paramiko

from app.database import get_db
from app.settings_service import get_setting
from app.logging_config import get_logger

logger = get_logger("nfs_service")


async def _ssh_user() -> tuple[str, str]:
    user = await get_setting("gateway_ssh_user", "root")
    key_path = await get_setting("gateway_ssh_key_path", "~/.ssh/id_rsa")
    return user, os.path.expanduser(key_path)


async def _ssh(host: str, cmd: str, timeout: int = 15) -> tuple[int, str, str]:
    user, key_path = await _ssh_user()
    return await asyncio.to_thread(_ssh_sync, host, cmd, timeout, user, key_path)


def _ssh_sync(host: str, cmd: str, timeout: int, user: str, key_path: str) -> tuple[int, str, str]:
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.WarningPolicy())
    try:
        ssh.connect(host, username=user, key_filename=key_path, timeout=timeout)
        _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
        exit_code = stdout.channel.recv_exit_status()
        out = stdout.read().decode(errors="replace")
        err = stderr.read().decode(errors="replace")
        return exit_code, out.strip(), err.strip()
    finally:
        ssh.close()


async def get_exports() -> list[dict]:
    db = await get_db()
    cursor = await db.execute("SELECT * FROM nfs_exports WHERE enabled=1 ORDER BY node, path")
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def add_export(node: str, path: str, options: str = "*(rw,sync,no_subtree_check)") -> dict:
    db = await get_db()
    await db.execute(
        "INSERT OR REPLACE INTO nfs_exports (node, path, options, enabled) VALUES (?, ?, ?, 1)",
        (node, path, options),
    )
    await db.commit()

    try:
        await _ssh(node, f"mkdir -p {path}", 10)
        await _apply_exports(node)
        logger.info("nfs_export_added", node=node, path=path)
        return {"ok": True, "node": node, "path": path}
    except Exception as e:
        logger.error("nfs_export_failed", node=node, exc_info=True)
        return {"ok": False, "error": str(e)}


async def update_export(export_id: int, options: str) -> dict:
    db = await get_db()
    cursor = await db.execute("SELECT * FROM nfs_exports WHERE id=?", (export_id,))
    row = await cursor.fetchone()
    if not row:
        return {"ok": False, "error": "Export not found"}

    await db.execute("UPDATE nfs_exports SET options=? WHERE id=?", (options, export_id))
    await db.commit()

    try:
        await _apply_exports(row["node"])
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def delete_export(export_id: int) -> dict:
    db = await get_db()
    cursor = await db.execute("SELECT * FROM nfs_exports WHERE id=?", (export_id,))
    row = await cursor.fetchone()
    if not row:
        return {"ok": False, "error": "Export not found"}

    await db.execute("UPDATE nfs_exports SET enabled=0 WHERE id=?", (export_id,))
    await db.commit()

    try:
        await _apply_exports(row["node"])
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def get_clients(node: str) -> dict:
    try:
        _, out, err = await _ssh(node, "showmount -a --no-headers 2>/dev/null || showmount -a 2>/dev/null | tail -n +2 || true", 10)
        lines = [line.strip() for line in out.split('\n') if line.strip()] if out else []
        clients = []
        for line in lines:
            parts = line.split(':') if ':' in line else line.split()
            if len(parts) >= 2:
                clients.append({"host": parts[0].strip(), "path": parts[1].strip()})
        return {"node": node, "clients": clients}
    except Exception as e:
        return {"node": node, "clients": [], "error": str(e)}


async def _apply_exports(node: str):
    db = await get_db()
    cursor = await db.execute("SELECT path, options FROM nfs_exports WHERE node=? AND enabled=1", (node,))
    rows = await cursor.fetchall()

    if not rows:
        await _ssh(node, "sed -i '/^\\/data\\/dc03/d' /etc/exports 2>/dev/null || true; exportfs -ra 2>/dev/null || true", 15)
        return

    export_lines = "\n".join(f"{r['path']} {r['options']}" for r in rows)
    script = f"""cat > /etc/exports.d/seaweedfs.exports << 'NFS_EOF'
{export_lines}
NFS_EOF
exportfs -ra 2>/dev/null || true
"""
    await _ssh(node, script, 15)


async def sync_all_exports() -> dict:
    exports = await get_exports()
    nodes = list({e["node"] for e in exports})
    results = {}
    for node in nodes:
        try:
            await _apply_exports(node)
            results[node] = "ok"
        except Exception as e:
            results[node] = str(e)
    return {"results": results}
