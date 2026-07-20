from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    seaweedfs_master_hosts: str = ""
    seaweedfs_filer_host: str = ""
    seaweedfs_volume_hosts: str = ""
    seaweedfs_s3_gateway_hosts: str = ""
    seaweedfs_request_timeout: int = 30

    database_url: str = "sqlite:///data/data.db"
    redis_url: Optional[str] = None

    admin_user: str = "admin"
    admin_password: str = "changeme"
    readonly_user: str = "viewer"
    readonly_password: str = "viewpass"
    session_secret: str = ""

    disk_health_enabled: bool = False
    disk_health_ssh_user: str = "root"
    disk_health_ssh_key_path: str = "~/.ssh/id_rsa"

    @property
    def master_list(self) -> list[str]:
        return [h.strip() for h in self.seaweedfs_master_hosts.split(",") if h.strip()]

    @property
    def filer_list(self) -> list[str]:
        return [h.strip() for h in self.seaweedfs_filer_host.split(",") if h.strip()]

    @property
    def volume_list(self) -> list[str]:
        return [h.strip() for h in self.seaweedfs_volume_hosts.split(",") if h.strip()]

    @property
    def s3_list(self) -> list[str]:
        return [h.strip() for h in self.seaweedfs_s3_gateway_hosts.split(",") if h.strip()]

    @property
    def all_node_hosts(self) -> list[str]:
        hosts = []
        for h in self.master_list + self.filer_list + self.volume_list + self.s3_list:
            ip = h.split(":")[0]
            if ip not in hosts:
                hosts.append(ip)
        return hosts

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
