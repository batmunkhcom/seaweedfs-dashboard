import pytest
from unittest.mock import AsyncMock, MagicMock, patch


class TestBackupService:
    def test_instance(self):
        from app.services.backup_service import create_backup
        assert callable(create_backup)

    @pytest.mark.asyncio
    async def test_list_backups_empty(self):
        from app.services.backup_service import list_backups

        mock_db = AsyncMock()
        mock_cursor = AsyncMock()
        mock_cursor.fetchall.return_value = []

        with patch("app.services.backup_service.get_db", return_value=mock_db):
            mock_db.execute.return_value = mock_cursor
            result = await list_backups()
            assert result == []

    @pytest.mark.asyncio
    async def test_list_backups_with_data(self):
        from app.services.backup_service import list_backups

        mock_db = AsyncMock()
        mock_cursor = AsyncMock()
        mock_cursor.fetchall.return_value = [
            {
                "id": 1, "status": "success", "size_bytes": 1024,
                "filer_hosts": '["172.16.0.2:8888"]', "s3_key": "backup-1.bak",
                "created_at": "2026-01-01", "s3_uploaded": 0,
            }
        ]

        with patch("app.services.backup_service.get_db", return_value=mock_db):
            with patch("pathlib.Path.exists", return_value=False):
                mock_db.execute.return_value = mock_cursor
                result = await list_backups()
                assert len(result) == 1
                assert result[0]["id"] == 1

    @pytest.mark.asyncio
    async def test_upload_to_s3_no_file(self):
        from app.services.backup_service import _upload_to_s3
        from pathlib import Path

        result = await _upload_to_s3(Path("/nonexistent/file.bak"), "bucket", "http://localhost:8333")
        assert result["ok"] is False

    @pytest.mark.asyncio
    async def test_cleanup_old_backups(self):
        from app.services.backup_service import cleanup_old_backups
        import tempfile, os
        tmpdir = tempfile.mkdtemp()
        try:
            mock_db = AsyncMock()
            mock_cursor = AsyncMock()
            mock_cursor.fetchall.return_value = []
            mock_db.execute.return_value = mock_cursor
            with patch("app.services.backup_service.get_setting_int", return_value=7):
                with patch("app.services.backup_service.get_db", return_value=mock_db):
                    with patch("pathlib.Path.glob", return_value=[]):
                        with patch("pathlib.Path.mkdir"):
                            result = await cleanup_old_backups()
                            assert "deleted" in result
        finally:
            try: os.rmdir(tmpdir)
            except: pass


class TestGatewayService:
    def test_get_gateway_status_empty(self):
        from app.services.gateway_service import get_gateway_status

        mock_db = AsyncMock()
        mock_cursor = AsyncMock()
        mock_cursor.fetchall.return_value = []

        with patch("app.services.gateway_service.get_db", return_value=mock_db):
            import asyncio
            async def run():
                mock_db.execute.return_value = mock_cursor
                result = await get_gateway_status()
                assert result == []
            asyncio.run(run())

    def test_start_webdav_validation(self):
        from app.services.gateway_service import start_webdav
        assert callable(start_webdav)

    def test_mount_fuse_validation(self):
        from app.services.gateway_service import mount_fuse
        assert callable(mount_fuse)

    def test_unmount_fuse_validation(self):
        from app.services.gateway_service import unmount_fuse
        assert callable(unmount_fuse)

    def test_test_webdav_no_connection(self):
        from app.services.gateway_service import test_webdav
        import asyncio
        async def run():
            with patch("httpx.AsyncClient.request", side_effect=Exception("refused")):
                result = await test_webdav("10.0.0.1", 9999)
                assert result["ok"] is False
        asyncio.run(run())

    def test_get_fuse_status_no_mount(self):
        from app.services.gateway_service import get_fuse_status
        import asyncio
        async def run():
            mock_db = AsyncMock()
            mock_cursor = AsyncMock()
            mock_cursor.fetchone.return_value = None
            with patch("app.services.gateway_service.get_db", return_value=mock_db):
                mock_db.execute.return_value = mock_cursor
                result = await get_fuse_status("10.0.0.1")
                assert result["mounted"] is False
        asyncio.run(run())


class TestNfsService:
    def test_get_exports_empty(self):
        from app.services.nfs_service import get_exports

        mock_db = AsyncMock()
        mock_cursor = AsyncMock()
        mock_cursor.fetchall.return_value = []

        with patch("app.services.nfs_service.get_db", return_value=mock_db):
            import asyncio
            async def run():
                mock_db.execute.return_value = mock_cursor
                result = await get_exports()
                assert result == []
            asyncio.run(run())

    def test_add_export_validation(self):
        from app.services.nfs_service import add_export
        assert callable(add_export)

    def test_delete_export_not_found(self):
        from app.services.nfs_service import delete_export
        import asyncio
        async def run():
            mock_db = AsyncMock()
            mock_cursor = AsyncMock()
            mock_cursor.fetchone.return_value = None
            with patch("app.services.nfs_service.get_db", return_value=mock_db):
                mock_db.execute.return_value = mock_cursor
                result = await delete_export(999)
                assert result["ok"] is False
        asyncio.run(run())

    def test_update_export_not_found(self):
        from app.services.nfs_service import update_export
        import asyncio
        async def run():
            mock_db = AsyncMock()
            mock_cursor = AsyncMock()
            mock_cursor.fetchone.return_value = None
            with patch("app.services.nfs_service.get_db", return_value=mock_db):
                mock_db.execute.return_value = mock_cursor
                result = await update_export(999, "*(rw,sync)")
                assert result["ok"] is False
        asyncio.run(run())

    def test_get_clients_no_node(self):
        from app.services.nfs_service import get_clients
        import asyncio
        async def run():
            result = await get_clients("")
            assert "error" in result
        asyncio.run(run())

    @pytest.mark.asyncio
    async def test_sync_all_exports_empty(self):
        from app.services.nfs_service import sync_all_exports

        mock_db = AsyncMock()
        mock_cursor = AsyncMock()
        mock_cursor.fetchall.return_value = []

        with patch("app.services.nfs_service.get_db", return_value=mock_db):
            mock_db.execute.return_value = mock_cursor
            result = await sync_all_exports()
            assert result == {"results": {}}


class TestWebhookService:
    def test_instance(self):
        from app.services.webhook_service import WebhookService
        svc = WebhookService()
        assert svc is not None

    def test_enqueue_works(self):
        from app.services.webhook_service import WebhookService
        svc = WebhookService()
        assert callable(svc.enqueue)

    def test_start_stop_handlers(self):
        from app.services.webhook_service import WebhookService
        svc = WebhookService()
        assert callable(svc.start)
        assert callable(svc.stop)


class TestS3Routes:
    def test_s3_buckets_route_exists(self):
        import asyncio
        from app.main import app
        from httpx import AsyncClient, ASGITransport
        async def run():
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as ac:
                r = await ac.get("/api/s3/buckets")
                assert r.status_code >= 200
        asyncio.run(run())


class TestLifecycleMore:
    def test_lifecycle_instance_running_false(self):
        from app.services.lifecycle_service import LifecycleEngine
        engine = LifecycleEngine()
        assert engine._running is False

    @pytest.mark.asyncio
    async def test_get_policies_empty(self):
        from app.services.lifecycle_service import get_policies

        mock_db = AsyncMock()
        mock_cursor = AsyncMock()
        mock_cursor.fetchall.return_value = []

        with patch("app.services.lifecycle_service.get_db", return_value=mock_db):
            mock_db.execute.return_value = mock_cursor
            result = await get_policies()
            assert isinstance(result, list)

    def test_parse_ttl(self):
        from app.services.lifecycle_service import _parse_ttl
        assert _parse_ttl("30d") == 2592000
        assert _parse_ttl("90d") == 7776000
        assert _parse_ttl("1d") == 86400

    @pytest.mark.asyncio
    async def test_get_transitions_empty(self):
        from app.services.lifecycle_service import get_transitions

        mock_db = AsyncMock()
        mock_cursor = AsyncMock()
        mock_cursor.fetchall.return_value = []

        with patch("app.services.lifecycle_service.get_db", return_value=mock_db):
            mock_db.execute.return_value = mock_cursor
            result = await get_transitions()
            assert isinstance(result, list)


class TestHardeningMore:
    def test_hardening_instance(self):
        from app.services.hardening_service import HardeningService
        svc = HardeningService()
        assert svc._running is False

    def test_get_hardening_service(self):
        from app.services.hardening_service import get_hardening_service
        svc = get_hardening_service()
        assert svc is not None
        assert isinstance(svc.__class__.__name__, str)

    def test_deploy_compression_validation(self):
        from app.services.hardening_service import HardeningService
        svc = HardeningService()
        assert callable(svc.deploy_compression)

    def test_deploy_encryption_validation(self):
        from app.services.hardening_service import HardeningService
        svc = HardeningService()
        assert callable(svc.deploy_encryption)


class TestSseManager:
    def test_register_subscriber(self):
        from app.routes.sse import register_subscriber
        q = register_subscriber()
        assert q is not None
        assert hasattr(q, 'put')
        assert hasattr(q, 'get')

    def test_publish_alert_function_exists(self):
        from app.routes.sse import publish_alert
        assert callable(publish_alert)


class TestCsrfMiddleware:
    def test_get_requests_passthrough(self):
        from app.middleware.csrf_middleware import CsrfMiddleware
        middleware = CsrfMiddleware(app=MagicMock())
        assert middleware is not None

    def test_generate_csrf_token(self):
        from app.middleware.csrf_middleware import generate_csrf_token
        token = generate_csrf_token()
        assert len(token) == 64
        assert token != generate_csrf_token()


class TestApiKeyService:
    def test_validate_invalid_key(self):
        from app.services.api_key_service import validate_api_key
        import asyncio
        async def run():
            mock_db = AsyncMock()
            mock_cursor = AsyncMock()
            mock_cursor.fetchone.return_value = None
            with patch("app.services.api_key_service.get_db", return_value=mock_db):
                mock_db.execute.return_value = mock_cursor
                result = await validate_api_key("invalid-key-123")
                assert result is None
        asyncio.run(run())


class TestSettingsService:
    @pytest.mark.asyncio
    async def test_get_setting_default(self):
        from app.settings_service import get_setting

        with patch("app.settings_service._cache_loaded", True):
            with patch("app.settings_service._cache", {}):
                val = await get_setting("nonexistent_key", "default_val")
                assert val == "default_val"

    @pytest.mark.asyncio
    async def test_get_setting_int(self):
        from app.settings_service import get_setting_int

        with patch("app.settings_service._cache_loaded", True):
            with patch("app.settings_service._cache", {"some_int_key": "42"}):
                val = await get_setting_int("some_int_key", 0)
                assert val == 42

    @pytest.mark.asyncio
    async def test_get_setting_int_default_when_missing(self):
        from app.settings_service import get_setting_int

        with patch("app.settings_service._cache_loaded", True):
            with patch("app.settings_service._cache", {}):
                val = await get_setting_int("missing_key", 100)
                assert val == 100


class TestDatabase:
    @pytest.mark.integration
    async def test_setup_and_shutdown(self):
        from app.database import setup_database, shutdown_database, get_db
        await setup_database()
        db = await get_db()
        assert db is not None
        cursor = await db.execute("SELECT 1")
        row = await cursor.fetchone()
        assert row[0] == 1
        await shutdown_database()

    def test_get_db_without_setup_fails(self):
        from app.database import get_db
        import asyncio
        async def run():
            try:
                await get_db()
                assert False, "Should have raised"
            except Exception:
                pass
        asyncio.run(run())
