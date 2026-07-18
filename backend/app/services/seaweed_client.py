import httpx
from structlog.stdlib import BoundLogger

from app.config import settings
from app.logging_config import get_logger


class SeaweedClient:
    def __init__(self):
        self.logger: BoundLogger = get_logger("seaweed_client")
        self._client: httpx.AsyncClient | None = None
        self._master_index: int = 0
        self._filer_index: int = 0

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None:
            raise RuntimeError("SeaweedClient not started")
        return self._client

    async def start(self):
        self._client = httpx.AsyncClient(timeout=settings.seaweedfs_request_timeout)

    async def stop(self):
        if self._client:
            await self._client.aclose()
            self._client = None

    async def get_master(self) -> str:
        masters = settings.master_list
        for attempt in range(len(masters)):
            idx = (self._master_index + attempt) % len(masters)
            host = masters[idx]
            try:
                resp = await self.client.get(f"http://{host}/cluster/status")
                if resp.status_code == 200:
                    self._master_index = idx
                    return host
            except Exception:
                self.logger.warning("master_unreachable", host=host, exc_info=True)

        self.logger.error("all_masters_failed", masters=masters)
        raise RuntimeError("No reachable master")

    async def get_filer(self) -> str:
        filers = settings.filer_list
        for attempt in range(len(filers)):
            idx = (self._filer_index + attempt) % len(filers)
            host = filers[idx]
            try:
                resp = await self.client.get(f"http://{host}/")
                if resp.status_code in (200, 404):
                    self._filer_index = idx
                    return host
            except Exception:
                self.logger.warning("filer_unreachable", host=host, exc_info=True)

        self.logger.error("all_filers_failed", filers=filers)
        raise RuntimeError("No reachable filer")

    async def request(
        self, method: str, path: str, *, master: bool = True, **kwargs
    ) -> httpx.Response:
        base = await self.get_master() if master else await self.get_filer()
        url = f"http://{base}{path}"

        try:
            resp = await self.client.request(method, url, **kwargs)
            resp.raise_for_status()
            return resp
        except Exception:
            self.logger.error("api_request_failed", method=method, path=path, url=url, exc_info=True)
            raise

    async def master_get(self, path: str, **kwargs) -> httpx.Response:
        return await self.request("GET", path, master=True, **kwargs)

    async def filer_get(self, path: str, **kwargs) -> httpx.Response:
        headers = kwargs.pop("headers", {})
        headers["Accept"] = "application/json"
        return await self.request("GET", path, master=False, headers=headers, **kwargs)


_seaweed_client: SeaweedClient | None = None


def get_seaweed_client() -> SeaweedClient:
    global _seaweed_client
    if _seaweed_client is None:
        _seaweed_client = SeaweedClient()
    return _seaweed_client


async def startup_seaweed_client():
    await get_seaweed_client().start()


async def shutdown_seaweed_client():
    global _seaweed_client
    if _seaweed_client:
        await _seaweed_client.stop()
        _seaweed_client = None
