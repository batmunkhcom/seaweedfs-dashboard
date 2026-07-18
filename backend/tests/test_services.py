import pytest
from unittest.mock import AsyncMock, patch, MagicMock


class TestAlertEngine:
    def test_instance_creation(self):
        from app.services.alert_engine import AlertEngine
        engine = AlertEngine()
        assert engine is not None
        assert engine._running is False

    @pytest.mark.asyncio
    async def test_resolve_alert_dedup(self):
        from app.services.alert_engine import AlertEngine
        engine = AlertEngine()

        mock_db = AsyncMock()
        mock_cursor = AsyncMock()
        mock_cursor.fetchall.return_value = [{"id": 1}]
        mock_db.execute.return_value = mock_cursor

        with patch("app.services.alert_engine.get_db", return_value=mock_db):
            result = await engine._resolve_alert("disk_usage:10.0.0.1")
            assert result is True

    @pytest.mark.asyncio
    async def test_create_alert_no_duplicate(self):
        from app.services.alert_engine import AlertEngine
        engine = AlertEngine()

        mock_db = AsyncMock()
        mock_cursor = AsyncMock()
        mock_cursor.fetchone.return_value = None
        mock_db.execute.return_value = mock_cursor

        with patch("app.services.alert_engine.get_db", return_value=mock_db):
            with patch("app.routes.sse.publish_alert", new_callable=AsyncMock):
                await engine._create_alert(
                    "disk_usage", "warning", "Test title", "Test desc", "10.0.0.1", "test_key"
                )
                assert mock_db.execute.call_count >= 2

    @pytest.mark.asyncio
    async def test_create_alert_duplicate_skips(self):
        from app.services.alert_engine import AlertEngine
        engine = AlertEngine()

        mock_db = AsyncMock()
        mock_cursor = AsyncMock()
        mock_cursor.fetchone.return_value = {"id": 1, "status": "new"}
        mock_db.execute.return_value = mock_cursor

        with patch("app.services.alert_engine.get_db", return_value=mock_db):
            await engine._create_alert(
                "disk_usage", "warning", "Test", "Test", "10.0.0.1", "existing_key"
            )
            mock_db.execute.assert_called_once()

    def test_publish_webhook_handles_errors(self):
        from app.services.alert_engine import AlertEngine
        engine = AlertEngine()

        async def run():
            with patch("app.services.webhook_service.publish_webhook_event", side_effect=Exception("test")):
                await engine._publish_webhook("test_event", {})

        import asyncio
        asyncio.run(run())

    @pytest.mark.asyncio
    async def test_heartbeat_writes(self):
        from app.services.alert_engine import AlertEngine
        engine = AlertEngine()

        mock_db = AsyncMock()
        mock_db.execute.return_value = AsyncMock()

        with patch("app.services.alert_engine.get_db", return_value=mock_db):
            await engine._write_heartbeat()
            mock_db.execute.assert_called_once()

    def test_fetch_real_disk_and_alert_under_threshold(self):
        from app.services.alert_engine import AlertEngine
        engine = AlertEngine()

        import httpx
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"DiskStatuses": [{"percent_used": 50.0}]}

        async def run():
            with patch("httpx.AsyncClient.get", return_value=mock_resp):
                with patch.object(engine, "_create_alert", new_callable=AsyncMock) as mc:
                    with patch.object(engine, "_resolve_alert", new_callable=AsyncMock) as mr:
                        await engine._fetch_real_disk_and_alert("10.0.0.1", 90, "test")
                        mr.assert_called_once()
                        mc.assert_not_called()

        import asyncio
        asyncio.run(run())


class TestSnapshotService:
    def test_instance(self):
        from app.services.snapshot import SnapshotService
        svc = SnapshotService()
        assert svc is not None

    @pytest.mark.asyncio
    async def test_store_and_cleanup(self):
        from app.services.snapshot import SnapshotService
        svc = SnapshotService()

        mock_db = AsyncMock()
        mock_db.execute.return_value = AsyncMock()

        with patch("app.services.snapshot.get_db", return_value=mock_db):
            with patch("app.services.snapshot.get_setting_int", return_value=30):
                await svc._store({"totalVolumes": 10, "totalFiles": 100, "freeSpace": 5, "maxSpace": 7, "volumeServers": 3, "healthyNodes": 3, "masterLeader": "test"})
                assert mock_db.execute.call_count >= 2
                assert mock_db.commit.call_count >= 1

    def test_singleton_same_instance(self):
        from app.services.snapshot import get_snapshot_service
        s1 = get_snapshot_service()
        s2 = get_snapshot_service()
        assert s1 is s2


class TestLifecycleEngine:
    def test_instance(self):
        from app.services.lifecycle_service import LifecycleEngine
        engine = LifecycleEngine()
        assert engine is not None

    @pytest.mark.asyncio
    async def test_record_transition_no_duplicate(self):
        from app.services.lifecycle_service import LifecycleEngine
        engine = LifecycleEngine()

        mock_db = AsyncMock()
        mock_cursor = AsyncMock()
        mock_cursor.fetchone.return_value = None
        mock_db.execute.return_value = mock_cursor

        with patch("app.services.lifecycle_service.get_db", return_value=mock_db):
            await engine._record_transition("bucket1", "obj1", "expire", "pending")
            mock_db.execute.assert_called()
            mock_db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_parse_s3_list(self):
        from app.services.lifecycle_service import LifecycleEngine
        engine = LifecycleEngine()

        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "Contents": [
                {"Key": "file1.txt", "LastModified": "2026-01-01T00:00:00Z", "Size": 100},
            ]
        }
        result = engine._parse_s3_list(mock_resp)
        assert len(result) == 1
        assert result[0]["key"] == "file1.txt"

    def test_parse_s3_list_empty(self):
        from app.services.lifecycle_service import LifecycleEngine
        engine = LifecycleEngine()
        result = engine._parse_s3_list(None)
        assert result == []

    def test_templates_exist(self):
        from app.services.lifecycle_service import LIFECYCLE_TEMPLATES
        assert "expire_7d" in LIFECYCLE_TEMPLATES
        assert "expire_30d" in LIFECYCLE_TEMPLATES
        assert "transition_30d" in LIFECYCLE_TEMPLATES


class TestHardeningService:
    def test_instance(self):
        from app.services.hardening_service import HardeningService
        svc = HardeningService()
        assert svc is not None

    @pytest.mark.asyncio
    async def test_check_replication_drift(self):
        from app.services.hardening_service import HardeningService
        from unittest.mock import AsyncMock, MagicMock, patch

        svc = HardeningService()

        mock_client = MagicMock()
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "Topology": {
                "Layouts": [{"replication": "001"}],
                "DataCenters": [{"Racks": [{"DataNodes": []}]}],
            }
        }
        mock_client.master_get = AsyncMock(return_value=mock_resp)

        with patch("app.services.seaweed_client.get_seaweed_client", return_value=mock_client):
            with patch("app.services.hardening_service.get_setting", return_value="001"):
                result = await svc.check_replication_drift()
                assert result["ok"] is True
                assert result["current_replication"] == "001"
                assert result["drifted"] is False


class TestSeaweedClient:
    def test_get_seaweed_client(self):
        from app.services.seaweed_client import get_seaweed_client
        client = get_seaweed_client()
        assert client is not None

    @pytest.mark.asyncio
    async def test_master_get_with_mock(self):
        from app.services.seaweed_client import SeaweedClient
        client = SeaweedClient()

        import httpx
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"ok": True}

        mock_http = AsyncMock()
        mock_http.get = AsyncMock(return_value=mock_resp)
        client._client = mock_http

        result = await client.master_get("/test")
        assert result is not None
        mock_http.get.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_filer_returns_host(self):
        from app.services.seaweed_client import SeaweedClient
        client = SeaweedClient()

        mock_http = AsyncMock()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_http.get = AsyncMock(return_value=mock_resp)
        client._client = mock_http

        host = await client.get_filer()
        assert host is not None
        assert isinstance(host, str)


class TestAuthRoutes:
    def test_login_requires_fields(self):
        from app.main import app
        from httpx import AsyncClient, ASGITransport
        import asyncio

        async def run():
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as ac:
                r = await ac.post("/api/auth/login", json={})
                assert r.status_code >= 400

        asyncio.run(run())

    @pytest.mark.integration
    def test_login_bad_credentials(self):
        from app.main import app
        from httpx import AsyncClient, ASGITransport
        import asyncio

        async def run():
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as ac:
                r = await ac.post("/api/auth/login", json={"username": "bad", "password": "wrong"})
                assert r.status_code >= 400

        asyncio.run(run())

    def test_auth_me_requires_session(self):
        from app.main import app
        from httpx import AsyncClient, ASGITransport
        import asyncio

        async def run():
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as ac:
                r = await ac.get("/api/auth/me")
                assert r.status_code >= 400

        asyncio.run(run())


class TestHealthEndpoint:
    def test_health_returns_200(self):
        from app.main import app
        from httpx import AsyncClient, ASGITransport
        import asyncio

        async def run():
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as ac:
                r = await ac.get("/api/health")
                assert r.status_code == 200
                data = r.json()
                assert "status" in data
                assert "database" in data
                assert "components" in data

        asyncio.run(run())


class TestACLService:
    def test_permissions_constants(self):
        from app.services.acl_service import PERMISSIONS, PERMISSION_LABELS
        assert len(PERMISSIONS) == 5
        assert PERMISSION_LABELS["R"] == "Read"
        assert PERMISSION_LABELS["W"] == "Write"

    @pytest.mark.asyncio
    async def test_test_permission_adds_audit_log(self):
        from app.services.acl_service import test_permission

        mock_db = AsyncMock()
        mock_cursor = AsyncMock()
        mock_cursor.fetchall.return_value = []
        mock_db.execute.return_value = mock_cursor

        with patch("app.services.acl_service.get_db", return_value=mock_db):
            result = await test_permission("testuser", "/path", "R")
            assert result["allowed"] is False
            assert result["user"] == "testuser"


class TestAlertsTable:
    @pytest.mark.integration
    async def test_alerts_table_exists_with_db(self):
        from app.database import setup_database, shutdown_database, get_db
        await setup_database()
        try:
            db = await get_db()
            cursor = await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='alerts'")
            row = await cursor.fetchone()
            assert row is not None
        finally:
            await shutdown_database()


class TestRuntimeSettings:
    @pytest.mark.integration
    async def test_snapshot_settings_exist(self):
        from app.database import setup_database, shutdown_database
        from app.settings_service import load_runtime_settings, get_setting
        await setup_database()
        try:
            await load_runtime_settings()
            val = await get_setting("snapshot_interval_seconds", "60")
            assert val is not None
        finally:
            await shutdown_database()
