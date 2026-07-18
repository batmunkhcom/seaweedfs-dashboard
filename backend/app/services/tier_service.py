import asyncio
import json
import time
import os

from app.database import get_db
from app.settings_service import get_setting, get_setting_int
from app.config import settings
from app.logging_config import get_logger

logger = get_logger("tier_service")

TIER_TYPES = ["hot", "warm", "cold"]
PROVIDERS = ["local", "s3", "gcs", "azure"]


async def get_tiers() -> list[dict]:
    db = await get_db()
    cursor = await db.execute("SELECT * FROM tier_configs ORDER BY tier_type")
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def save_tier(body: dict) -> dict:
    db = await get_db()
    name = body.get("name", "")
    tier_type = body.get("tier_type", "hot")
    provider = body.get("provider", "local")
    config = body.get("config", {})
    enabled = body.get("enabled", True)

    await db.execute(
        "INSERT OR REPLACE INTO tier_configs (name, tier_type, provider, config_json, enabled, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'))",
        (name, tier_type, provider, json.dumps(config), int(enabled)),
    )
    await db.commit()
    return {"ok": True, "name": name}


async def delete_tier(tier_id: int) -> dict:
    db = await get_db()
    await db.execute("DELETE FROM tier_configs WHERE id=?", (tier_id,))
    await db.commit()
    return {"ok": True}


async def get_tier_stats() -> dict:
    tiers = await get_tiers()
    stats = {"tiers": tiers, "total_estimated_cost": 0.0}
    cost_per_gb = float(await get_setting("tiers_cost_hot_gb_month", "0.05"))
    total_storage = sum(t.get("config_json", {}).get("capacity_gb", 0) if isinstance(t.get("config_json"), dict) else 0 for t in tiers)
    stats["total_estimated_cost"] = round(total_storage * cost_per_gb, 2)
    return stats


async def test_tier_connection(provider: str, config: dict) -> dict:
    try:
        import httpx
        if provider == "s3":
            endpoint = config.get("endpoint", "")
            access_key = config.get("access_key", "")
            async with httpx.AsyncClient(timeout=10) as hc:
                r = await hc.get(endpoint, auth=(access_key, config.get("secret_key", "")))
                return {"ok": r.status_code < 500, "status": r.status_code, "provider": provider}
        return {"ok": False, "error": f"Provider {provider} test not implemented"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def test_gcs_connection(config: dict) -> dict:
    bucket = config.get("bucket", "")
    project = config.get("project_id", "")
    creds = config.get("credentials_json", "")
    if not bucket:
        return {"ok": False, "error": "bucket required"}

    try:
        import paramiko
        import tempfile

        key_path = os.path.expanduser(settings.disk_health_ssh_key_path)
        host = settings.all_node_hosts[0]

        loop = asyncio.get_event_loop()

        def _run():
            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.WarningPolicy())
            client.load_system_host_keys()
            key = paramiko.RSAKey.from_private_key_file(key_path)
            client.connect(hostname=host, username=settings.disk_health_ssh_user, pkey=key, timeout=10)
            try:
                if creds:
                    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
                        f.write(creds)
                        cred_path = f.name
                    cmd = f"GOOGLE_APPLICATION_CREDENTIALS={cred_path} gsutil ls gs://{bucket} 2>&1 | head -5"
                else:
                    cmd = f"gsutil ls gs://{bucket} 2>&1 | head -5"
                stdin, stdout, stderr = client.exec_command(cmd, timeout=15)
                exit_code = stdout.channel.recv_exit_status()
                out = stdout.read().decode()
                client.close()
                return {"ok": exit_code == 0, "exit_code": exit_code, "output": out[:300]}
            finally:
                try:
                    client.close()
                except Exception:
                    pass

        return await loop.run_in_executor(None, _run)
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def test_azure_connection(config: dict) -> dict:
    conn_str = config.get("connection_string", "")
    container = config.get("container", "")
    if not container:
        return {"ok": False, "error": "container required"}

    try:
        import paramiko
        key_path = os.path.expanduser(settings.disk_health_ssh_key_path)
        host = settings.all_node_hosts[0]

        loop = asyncio.get_event_loop()

        def _run():
            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.WarningPolicy())
            client.load_system_host_keys()
            key = paramiko.RSAKey.from_private_key_file(key_path)
            client.connect(hostname=host, username=settings.disk_health_ssh_user, pkey=key, timeout=10)
            try:
                if conn_str:
                    cmd = f"az storage blob list --container-name {container} --connection-string '{conn_str}' --num-results 5 2>&1"
                else:
                    cmd = f"az storage blob list --container-name {container} --auth-mode login --num-results 5 2>&1"
                stdin, stdout, stderr = client.exec_command(cmd, timeout=15)
                exit_code = stdout.channel.recv_exit_status()
                out = stdout.read().decode()
                client.close()
                return {"ok": exit_code == 0, "exit_code": exit_code, "output": out[:300]}
            finally:
                try:
                    client.close()
                except Exception:
                    pass

        return await loop.run_in_executor(None, _run)
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def test_tier_connection_full(provider: str, config: dict) -> dict:
    if provider == "s3":
        return await test_tier_connection(provider, config)
    elif provider == "gcs":
        return await test_gcs_connection(config)
    elif provider == "azure":
        return await test_azure_connection(config)
    return {"ok": False, "error": f"Unknown provider: {provider}"}


async def configure_tier_on_cluster(tier_name: str, tier_type: str, provider: str, config: dict) -> dict:
    try:
        import paramiko
        key_path = os.path.expanduser(settings.disk_health_ssh_key_path)
        host = settings.all_node_hosts[0]

        loop = asyncio.get_event_loop()

        def _run():
            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.WarningPolicy())
            client.load_system_host_keys()
            key = paramiko.RSAKey.from_private_key_file(key_path)
            client.connect(hostname=host, username=settings.disk_health_ssh_user, pkey=key, timeout=10)

            cmd = f"echo 'tier {tier_type}.set {tier_name} {provider}' | weed shell 2>&1"
            if provider == "s3":
                ep = config.get("endpoint", "")
                cmd = f"echo 'tier {tier_type}.configure {tier_name} {provider} endpoint={ep} access_key={config.get('access_key','')} secret_key={config.get('secret_key','')}' | weed shell -master={host}:9333 2>&1"
            elif provider == "gcs":
                bucket = config.get("bucket", "")
                cmd = f"echo 'tier {tier_type}.configure {tier_name} {provider} bucket={bucket}' | weed shell -master={host}:9333 2>&1"
            elif provider == "azure":
                container = config.get("container", "")
                cmd = f"echo 'tier {tier_type}.configure {tier_name} {provider} container={container} connection_string={config.get('connection_string','')}' | weed shell -master={host}:9333 2>&1"

            try:
                stdin, stdout, stderr = client.exec_command(cmd, timeout=20)
                exit_code = stdout.channel.recv_exit_status()
                out = stdout.read().decode()
                err = stderr.read().decode()
                client.close()
                return {"ok": exit_code == 0, "output": (out or err)[:300]}
            finally:
                try:
                    client.close()
                except Exception:
                    pass

        return await loop.run_in_executor(None, _run)
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def sync_all_tiers() -> dict:
    tiers = await get_tiers()
    results = {}
    for t in tiers:
        if not t.get("enabled"):
            continue
        config = t.get("config_json", {})
        if isinstance(config, str):
            try:
                config = json.loads(config)
            except Exception:
                config = {}
        r = await configure_tier_on_cluster(t["name"], t["tier_type"], t["provider"], config)
        results[t["name"]] = r

    ok_count = sum(1 for r in results.values() if r.get("ok"))
    logger.info("tier_sync_completed", total=len(results), ok=ok_count)
    return {"ok": ok_count == len(results), "synced": ok_count, "total": len(results), "results": results}


async def get_tier_usage_per_node() -> dict:
    try:
        import paramiko
        key_path = os.path.expanduser(settings.disk_health_ssh_key_path)
        results = {}

        for host in settings.all_node_hosts:
            loop = asyncio.get_event_loop()
            def _run():
                client = paramiko.SSHClient()
                client.set_missing_host_key_policy(paramiko.WarningPolicy())
                client.load_system_host_keys()
                key = paramiko.RSAKey.from_private_key_file(key_path)
                client.connect(hostname=host, username=settings.disk_health_ssh_user, pkey=key, timeout=10)
                try:
                    cmd = "echo 'tier.list' | weed shell -master=localhost:9333 2>&1"
                    stdin, stdout, stderr = client.exec_command(cmd, timeout=15)
                    stdout.channel.recv_exit_status()
                    out = stdout.read().decode()
                    client.close()
                    return out[:500]
                finally:
                    try:
                        client.close()
                    except Exception:
                        pass
            out = await loop.run_in_executor(None, _run)
            results[host] = out

        return {"ok": True, "node_results": results}
    except Exception as e:
        return {"ok": False, "error": str(e)}
