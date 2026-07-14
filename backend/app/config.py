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

    disk_health_enabled: bool = False
    disk_health_ssh_user: str = "root"
    disk_health_ssh_key_path: str = "~/.ssh/id_rsa"

    @property
    def master_list(self) -> list[str]:
        return [h.strip() for h in self.seaweedfs_master_hosts.split(",") if h.strip()]

    @property
    def filer_list(self) -> list[str]:
        return [h.strip() for h in self.seaweedfs_filer_host.split(",") if h.strip()]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
