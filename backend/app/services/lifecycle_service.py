import time
import asyncio
from datetime import datetime, timedelta, timezone

from app.config import settings
from app.database import get_db
from app.services.seaweed_client import get_seaweed_client
from app.logging_config import get_logger

logger = get_logger("lifecycle_service")

LIFECYCLE_TEMPLATES = {
    "expire_7d": {"rules": [{"id": "expire-7d", "status": "Enabled", "filter": {"prefix": ""}, "expiration": {"days": 7}}]},
    "expire_30d": {"rules": [{"id": "expire-30d", "status": "Enabled", "filter": {"prefix": ""}, "expiration": {"days": 30}}]},
    "expire_90d": {"rules": [{"id": "expire-90d", "status": "Enabled", "filter": {"prefix": ""}, "expiration": {"days": 90}}]},
    "transition_30d": {"rules": [{"id": "transition-30d", "status": "Enabled", "filter": {"prefix": ""}, "transitions": [{"days": 30, "storageClass": "GLACIER"}]}]},
    "expire_deleted_1d": {"rules": [{"id": "cleanup-deleted", "status": "Enabled", "filter": {"prefix": ""}, "expiration": {"expiredObjectDeleteMarker": True}}, {"id": "abort-incomplete", "status": "Enabled", "filter": {"prefix": ""}, "abortIncompleteMultipartUpload": {"daysAfterInitiation": 1}}]},
}


async def get_policies() -> list[dict]:
    db = await get_db()
    cursor = await db.execute("SELECT * FROM lifecycle_policies ORDER BY bucket")
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def get_policy(bucket: str) -> dict | None:
    db = await get_db()
    cursor = await db.execute("SELECT * FROM lifecycle_policies WHERE bucket=?", (bucket,))
    row = await cursor.fetchone()
    return dict(row) if row else None


async def save_policy(bucket: str, policy: dict, enabled: bool = True) -> dict:
    import json
    policy_json = json.dumps(policy)

    db = await get_db()
    await db.execute(
        "INSERT OR REPLACE INTO lifecycle_policies (bucket, policy_json, enabled, updated_at) VALUES (?, ?, ?, datetime('now'))",
        (bucket, policy_json, int(enabled)),
    )
    await db.commit()

    try:
        client = get_seaweed_client()
        xml = _build_lifecycle_xml(policy)
        filer = await client.get_filer()
        url = f"http://{filer}/{bucket}?lifecycle"
        resp = await client.client.put(url, content=xml.encode(), headers={"Content-Type": "application/xml"})
        logger.info("lifecycle_applied", bucket=bucket, status=resp.status_code)
    except Exception:
        logger.warning("lifecycle_apply_failed", bucket=bucket, exc_info=True)

    return {"ok": True, "bucket": bucket}


async def delete_policy(bucket: str) -> dict:
    db = await get_db()
    await db.execute("DELETE FROM lifecycle_policies WHERE bucket=?", (bucket,))
    await db.commit()
    return {"ok": True}


async def get_policy_status(bucket: str) -> dict:
    db = await get_db()
    cursor = await db.execute("SELECT * FROM lifecycle_policies WHERE bucket=?", (bucket,))
    row = await cursor.fetchone()
    if not row:
        return {"bucket": bucket, "configured": False}
    return {
        "bucket": bucket, "configured": True,
        "enabled": bool(row["enabled"]),
        "last_run_at": row["last_run_at"], "next_run_at": row["next_run_at"],
    }


async def get_collections_ttl() -> list[dict]:
    client = get_seaweed_client()
    try:
        resp = await client.master_get("/collections")
        collections = resp.json()
        result = []
        for name in (collections.get("collections", []) or []):
            ttl_resp = await client.master_get(f"/collections/{name}/ttl")
            ttl_data = ttl_resp.json() if ttl_resp.text else {}
            result.append({"name": name, "ttl": ttl_data.get("ttl", ""), "ttl_seconds": _parse_ttl(ttl_data.get("ttl", ""))})
        return result
    except Exception:
        logger.error("collections_ttl_fetch_failed", exc_info=True)
        return []


async def set_collection_ttl(name: str, ttl: str) -> dict:
    client = get_seaweed_client()
    try:
        resp = await client.client.put(
            f"http://{await client.get_master()}/collections/{name}/ttl?ttl={ttl}",
        )
        return {"ok": resp.status_code == 200, "name": name, "ttl": ttl}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def get_transitions(bucket: str | None = None, limit: int = 50) -> list[dict]:
    db = await get_db()
    if bucket:
        cursor = await db.execute(
            "SELECT * FROM lifecycle_transitions WHERE bucket=? ORDER BY created_at DESC LIMIT ?",
            (bucket, limit),
        )
    else:
        cursor = await db.execute("SELECT * FROM lifecycle_transitions ORDER BY created_at DESC LIMIT ?", (limit,))
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


def _parse_ttl(ttl: str) -> int:
    if not ttl:
        return 0
    import re
    match = re.match(r'(\d+)([dhms])', ttl.lower())
    if not match:
        return 0
    val, unit = int(match.group(1)), match.group(2)
    multipliers = {'s': 1, 'm': 60, 'h': 3600, 'd': 86400}
    return val * multipliers.get(unit, 0)


def _build_lifecycle_xml(policy: dict) -> str:
    rules = policy.get("rules", [])
    parts = ['<?xml version="1.0" encoding="UTF-8"?>', '<LifecycleConfiguration>']
    for rule in rules:
        parts.append('<Rule>')
        parts.append(f'<ID>{rule.get("id", "rule")}</ID>')
        parts.append(f'<Status>{rule.get("status", "Enabled")}</Status>')
        filt = rule.get("filter", {})
        prefix = filt.get("prefix", "")
        if prefix:
            parts.append(f'<Filter><Prefix>{prefix}</Prefix></Filter>')
        if "expiration" in rule:
            exp = rule["expiration"]
            parts.append('<Expiration>')
            if "days" in exp:
                parts.append(f'<Days>{exp["days"]}</Days>')
            if exp.get("expiredObjectDeleteMarker"):
                parts.append('<ExpiredObjectDeleteMarker>true</ExpiredObjectDeleteMarker>')
            parts.append('</Expiration>')
        if "transitions" in rule:
            for tr in rule["transitions"]:
                parts.append('<Transition>')
                parts.append(f'<Days>{tr["days"]}</Days>')
                parts.append(f'<StorageClass>{tr.get("storageClass", "GLACIER")}</StorageClass>')
                parts.append('</Transition>')
        if "abortIncompleteMultipartUpload" in rule:
            a = rule["abortIncompleteMultipartUpload"]
            parts.append('<AbortIncompleteMultipartUpload>')
            parts.append(f'<DaysAfterInitiation>{a.get("daysAfterInitiation", 7)}</DaysAfterInitiation>')
            parts.append('</AbortIncompleteMultipartUpload>')
        parts.append('</Rule>')
    parts.append('</LifecycleConfiguration>')
    return '\n'.join(parts)


_eval_task: asyncio.Task | None = None
_last_restart_at: float = 0
_instance_count = 0


class LifecycleEngine:
    def __init__(self):
        global _instance_count
        _instance_count += 1
        self._running = False
        self._client = get_seaweed_client()

    async def start(self):
        global _eval_task, _last_restart_at
        now = time.time()
        if now - _last_restart_at < 300:
            logger.warning("lifecycle_engine_restart_cooldown")
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
        logger.info("lifecycle_engine_started")

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
        logger.info("lifecycle_engine_stopped")

    async def _eval_loop(self):
        while self._running:
            try:
                await self._evaluate_all_policies()
                self._update_heartbeat()
            except Exception:
                logger.error("lifecycle_eval_failed", exc_info=True)
            await asyncio.sleep(1800)

    async def _evaluate_all_policies(self):
        policies = await get_policies()
        for p in policies:
            if not p.get("enabled"):
                continue
            try:
                await self._evaluate_policy(p)
            except Exception:
                logger.error("lifecycle_eval_policy_failed", bucket=p.get("bucket"), exc_info=True)

    async def _evaluate_policy(self, policy: dict):
        bucket = policy["bucket"]
        policy_json = policy["policy_json"]
        import json
        try:
            rules = json.loads(policy_json) if isinstance(policy_json, str) else policy_json
        except Exception:
            rules = policy_json if isinstance(policy_json, dict) else {}
        rules_list = rules.get("rules", [])

        objects = await self._list_bucket_objects(bucket)
        now_ts = datetime.now(timezone.utc)
        transition_count = 0

        for obj in objects:
            last_mod = obj.get("last_modified")
            if not last_mod:
                continue
            try:
                if isinstance(last_mod, str):
                    last_mod = datetime.fromisoformat(last_mod.replace("Z", "+00:00")).replace(tzinfo=None)
            except Exception:
                continue

            age_days = (now_ts - last_mod).days

            for rule in rules_list:
                if rule.get("status") != "Enabled":
                    continue
                filt_prefix = (rule.get("filter") or {}).get("prefix", "")
                key = obj.get("key", "")
                if filt_prefix and not key.startswith(filt_prefix):
                    continue

                if "expiration" in rule:
                    days = rule["expiration"].get("days", 0)
                    if days and age_days >= days:
                        await self._record_transition(bucket, key, "expire", "pending")
                        transition_count += 1

                if "transitions" in rule:
                    for tr in rule["transitions"]:
                        t_days = tr.get("days", 0)
                        if t_days and age_days >= t_days:
                            await self._record_transition(
                                bucket, key,
                                f"transition_to_{tr.get('storageClass', 'unknown')}",
                                "completed",
                            )
                            transition_count += 1

        await self._update_policy_timestamps(bucket)
        if transition_count:
            logger.info("lifecycle_transitions_recorded", bucket=bucket, count=transition_count)
            try:
                from app.services.webhook_service import publish_webhook_event
                await publish_webhook_event("lifecycle_transition", {
                    "bucket": bucket,
                    "count": transition_count,
                    "action": "evaluated",
                })
            except Exception:
                logger.warning("lifecycle_webhook_failed", exc_info=True)

        await self._cleanup_old_transitions(bucket)

    async def _list_bucket_objects(self, bucket: str, max_keys: int = 100) -> list[dict]:
        try:
            s3_host = (await self._client.get_master()).replace(":9333", "")
            for host in self._client._master_hosts:
                try:
                    from app.config import settings
                except Exception:
                    pass
            s3_host = settings.filer_list[0].replace(":8888", ":8333") if hasattr(settings, 'filer_list') else "172.16.0.2:8333"
            s3_resp = await self._client.client.get(
                f"http://{s3_host}/{bucket}?list-type=2&max-keys={max_keys}",
                timeout=10,
            )
            if s3_resp.status_code != 200:
                return self._parse_s3_list(await self._get_any_s3_node(bucket, max_keys))
            return self._parse_s3_list(s3_resp)
        except Exception:
            return self._parse_s3_list(await self._get_any_s3_node(bucket, max_keys))

    async def _get_any_s3_node(self, bucket: str, max_keys: int):
        hosts = [h.split(":")[0] for h in settings.seaweedfs_s3_gateway_hosts.split(",")] if hasattr(settings, 'seaweedfs_s3_gateway_hosts') else ["172.16.0.2"]
        for host in hosts:
            try:
                r = await self._client.client.get(
                    f"http://{host}:8333/{bucket}?list-type=2&max-keys={max_keys}",
                    timeout=10,
                )
                if r.status_code == 200:
                    return r
            except Exception:
                continue
        return None

    def _parse_s3_list(self, resp) -> list[dict]:
        if resp is None:
            return []
        try:
            data = resp.json() if hasattr(resp, "json") else resp
        except Exception:
            return []
        contents = data.get("Contents") or data.get("contents") or []
        result = []
        for obj in contents:
            result.append({
                "key": obj.get("Key") or obj.get("key", ""),
                "last_modified": obj.get("LastModified") or obj.get("last_modified", ""),
                "size": obj.get("Size") or obj.get("size", 0),
            })
        return result

    async def _record_transition(self, bucket: str, key: str, action: str, status: str):
        try:
            db = await get_db()
            cursor = await db.execute(
                "SELECT id FROM lifecycle_transitions WHERE bucket=? AND object_key=? AND action=?",
                (bucket, key, action),
            )
            existing = await cursor.fetchone()
            if existing:
                return
            await db.execute(
                "INSERT INTO lifecycle_transitions (bucket, object_key, action, status) VALUES (?, ?, ?, ?)",
                (bucket, key, action, status),
            )
            await db.commit()
        except Exception:
            pass

    async def _update_policy_timestamps(self, bucket: str):
        try:
            db = await get_db()
            now = datetime.now(timezone.utc).isoformat()
            next_run = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
            await db.execute(
                "UPDATE lifecycle_policies SET last_run_at=?, next_run_at=? WHERE bucket=?",
                (now, next_run, bucket),
            )
            await db.commit()
        except Exception:
            pass

    async def _cleanup_old_transitions(self, bucket: str):
        try:
            db = await get_db()
            cutoff = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
            await db.execute(
                "DELETE FROM lifecycle_transitions WHERE bucket=? AND created_at < ?",
                (bucket, cutoff),
            )
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
                ("lifecycle_engine", 3600),
            )
            await db.commit()
        except Exception:
            pass


_lifecycle_engine: LifecycleEngine | None = None


def get_lifecycle_engine() -> LifecycleEngine:
    global _lifecycle_engine
    if _lifecycle_engine is None:
        _lifecycle_engine = LifecycleEngine()
    return _lifecycle_engine


async def start_lifecycle_engine():
    await get_lifecycle_engine().start()


async def stop_lifecycle_engine():
    global _lifecycle_engine
    if _lifecycle_engine:
        await _lifecycle_engine.stop()
        _lifecycle_engine = None
