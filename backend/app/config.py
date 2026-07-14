from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    seaweedfs_master_hosts: str = "172.16.0.1:9333,172.16.0.3:9333,172.16.0.5:9333"
    seaweedfs_filer_host: str = "172.16.0.2:8888,172.16.0.4:8888"
    seaweedfs_request_timeout: int = 30

    database_url: str = "sqlite:///data/data.db"
    redis_url: Optional[str] = None

    admin_user: str = "admin"
    admin_password: str = "changeme"
    readonly_user: str = "viewer"
    readonly_password: str = "viewpass"
    session_secret: str = "auto-generate-random-secret"

    max_upload_size_mb: int = 500
    allowed_extensions: str = ".jpg,.png,.pdf,.zip,.gz"
    max_files_per_upload: int = 10

    snapshot_interval_seconds: int = 60
    snapshot_retention_days: int = 30

    alert_disk_usage_pct: float = 90.0
    alert_garbage_ratio: float = 0.5
    alert_max_readonly_volumes: int = 3

    disk_health_enabled: bool = False
    disk_health_ssh_user: str = "root"
    disk_health_ssh_key_path: str = "~/.ssh/id_rsa"
    disk_health_scan_interval_hours: int = 24
    disk_health_temp_warn_c: int = 55
    disk_health_temp_crit_c: int = 65
    disk_health_wear_warn_pct: int = 85
    disk_health_realloc_warn_count: int = 10

    @property
    def master_list(self) -> list[str]:
        return [h.strip() for h in self.seaweedfs_master_hosts.split(",") if h.strip()]

    @property
    def filer_list(self) -> list[str]:
        return [h.strip() for h in self.seaweedfs_filer_host.split(",") if h.strip()]

    @property
    def allowed_extensions_list(self) -> list[str]:
        return [e.strip() for e in self.allowed_extensions.split(",") if e.strip()]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
