import asyncio
import json
import os
import time

import httpx
import paramiko

from app.config import settings
from app.database import get_db
from app.settings_service import get_setting, get_setting_int
from app.logging_config import get_logger

logger = get_logger("gateway_service")


async def _ssh_user_key() -> tuple[str, str]:
    user = await get_setting("gateway_ssh_user", "root")
    key_path = await get_setting("gateway_ssh_key_path", "~/.ssh/id_rsa")
    return user, os.path.expanduser(key_path)


async def _ssh_async(host: str, cmd: str, timeout: int = 15) -> tuple[int, str, str]:
    user, key_path = await _ssh_user_key()
    return await asyncio.to_thread(_ssh_sync, host, cmd, timeout, user, key_path)


def _ssh_sync(host: str, cmd: str, timeout: int = 15, user: str = "root", key_path: str = "~/.ssh/id_rsa") -> tuple[int, str, str]:
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


async def get_gateway_status() -> list[dict]:
    gateways = []
    db = await get_db()
    cursor = await db.execute("SELECT * FROM gateway_configs ORDER BY gw_type, node")
    rows = await cursor.fetchall()

    for r in rows:
        gw = dict(r)
        gw["config"] = json.loads(r["config_json"]) if r["config_json"] else {}
        running = False
        pid = ""

        try:
            if r["gw_type"] == "webdav":
                exit_code, out, _ = await _ssh_async(r["node"], "pgrep -f 'weed webdav' | head -1 || true", 10)
                running = exit_code == 0 and bool(out.strip())
                pid = out.strip() if running else ""
            elif r["gw_type"] == "fuse":
                exit_code, out, _ = await _ssh_async(r["node"], f"mount | grep {r['mount_path']} | head -1 || true", 10)
                running = bool(out.strip())
                pid = out.strip()[:100] if running else ""
        except Exception:
            pass

        gw["running"] = running
        gw["pid"] = pid
        gateways.append(gw)

    return gateways


async def start_webdav(node: str, port: int | None = None) -> dict:
    if not port:
        port = await get_setting_int("webdav_default_port", 9001)

    filer = next((h for h in settings.filer_list if h.startswith(node)), settings.filer_list[0])
    cmd = f"nohup weed webdav -filer={filer} -port={port} > /dev/null 2>&1 &"

    try:
        exit_code, out, err = await _ssh_async(node, cmd, 15)
        if exit_code == 0:
            db = await get_db()
            await db.execute(
                "INSERT OR REPLACE INTO gateway_configs (gw_type, node, port, mount_path, enabled, config_json) VALUES ('webdav', ?, ?, '', 1, '{}')",
                (node, port),
            )
            await db.commit()
            logger.info("webdav_started", node=node, port=port)
            return {"ok": True, "node": node, "port": port, "url": f"http://{node}:{port}"}
        else:
            return {"ok": False, "error": err or out or "Unknown error"}
    except Exception as e:
        logger.error("webdav_start_failed", node=node, exc_info=True)
        return {"ok": False, "error": str(e)}


async def stop_webdav(node: str) -> dict:
    try:
        _, out, _ = await _ssh_async(node, "pkill -f 'weed webdav' || true", 10)
        db = await get_db()
        await db.execute("UPDATE gateway_configs SET enabled=0 WHERE gw_type='webdav' AND node=?", (node,))
        await db.commit()
        logger.info("webdav_stopped", node=node)
        return {"ok": True, "node": node}
    except Exception as e:
        logger.error("webdav_stop_failed", node=node, exc_info=True)
        return {"ok": False, "error": str(e)}


async def update_webdav_config(node: str, port: int) -> dict:
    db = await get_db()
    await db.execute(
        "INSERT OR REPLACE INTO gateway_configs (gw_type, node, port, mount_path, enabled, config_json) VALUES ('webdav', ?, ?, '', 0, '{}')",
        (node, port),
    )
    await db.commit()
    return {"ok": True}


async def mount_fuse(node: str, mount_path: str | None = None) -> dict:
    if not mount_path:
        mount_path = await get_setting("fuse_default_mount", "/mnt/seaweedfs")

    filer = next((h for h in settings.filer_list if h.startswith(node)), settings.filer_list[0])

    mkdir_cmd = f"mkdir -p {mount_path}"
    await _ssh_async(node, mkdir_cmd, 10)

    cmd = f"nohup weed mount -filer={filer} -dir={mount_path} > /dev/null 2>&1 &"

    try:
        exit_code, out, err = await _ssh_async(node, cmd, 15)
        await asyncio.sleep(2)
        _, check_out, _ = await _ssh_async(node, f"mount | grep {mount_path} || true", 10)

        if exit_code == 0 or check_out.strip():
            db = await get_db()
            await db.execute(
                "INSERT OR REPLACE INTO gateway_configs (gw_type, node, port, mount_path, enabled, config_json) VALUES ('fuse', ?, 0, ?, 1, '{}')",
                (node, mount_path),
            )
            await db.commit()
            logger.info("fuse_mounted", node=node, path=mount_path)
            return {"ok": True, "node": node, "mount_path": mount_path}
        else:
            return {"ok": False, "error": err or "Mount failed"}
    except Exception as e:
        logger.error("fuse_mount_failed", node=node, exc_info=True)
        return {"ok": False, "error": str(e)}


async def unmount_fuse(node: str) -> dict:
    db = await get_db()
    cursor = await db.execute("SELECT mount_path FROM gateway_configs WHERE gw_type='fuse' AND node=?", (node,))
    row = await cursor.fetchone()
    mount_path = row["mount_path"] if row else "/mnt/seaweedfs"

    try:
        await _ssh_async(node, f"fusermount -u {mount_path} 2>/dev/null || umount {mount_path} 2>/dev/null || true", 10)
        await db.execute("UPDATE gateway_configs SET enabled=0 WHERE gw_type='fuse' AND node=?", (node,))
        await db.commit()
        logger.info("fuse_unmounted", node=node)
        return {"ok": True, "node": node}
    except Exception as e:
        logger.error("fuse_unmount_failed", node=node, exc_info=True)
        return {"ok": False, "error": str(e)}


async def update_fuse_config(node: str, mount_path: str) -> dict:
    db = await get_db()
    await db.execute(
        "INSERT OR REPLACE INTO gateway_configs (gw_type, node, port, mount_path, enabled, config_json) VALUES ('fuse', ?, 0, ?, 0, '{}')",
        (node, mount_path),
    )
    await db.commit()
    return {"ok": True}


async def get_fuse_status(node: str) -> dict:
    db = await get_db()
    cursor = await db.execute("SELECT * FROM gateway_configs WHERE gw_type='fuse' AND node=?", (node,))
    row = await cursor.fetchone()
    if not row:
        return {"node": node, "mounted": False}

    mount_path = row["mount_path"]
    try:
        _, out, _ = await _ssh_async(node, f"df -B1 {mount_path} 2>/dev/null | tail -1 || true", 10)
        parts = out.split()
        disk = {}
        if len(parts) >= 4:
            disk = {
                "total_gb": round(int(parts[0]) / 1e9, 1),
                "used_gb": round(int(parts[1]) / 1e9, 1),
                "avail_gb": round(int(parts[2]) / 1e9, 1),
                "pct": parts[3].rstrip('%'),
            }
        _, check_out, _ = await _ssh_async(node, f"mount | grep {mount_path} || true", 10)
        return {
            "node": node, "mount_path": mount_path,
            "mounted": bool(check_out.strip()), "disk": disk,
        }
    except Exception as e:
        return {"node": node, "mount_path": mount_path, "mounted": False, "error": str(e)}


async def test_webdav(node: str, port: int) -> dict:
    try:
        url = f"http://{node}:{port}"
        async with httpx.AsyncClient(timeout=10) as hc:
            r = await hc.request("PROPFIND", url, headers={"Depth": "0"})
            return {"ok": r.status_code < 500, "status": r.status_code, "url": url}
    except Exception as e:
        return {"ok": False, "error": str(e)}
