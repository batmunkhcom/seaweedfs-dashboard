from fastapi import APIRouter, Depends

from app.middleware.auth_middleware import require_admin
from app.services.gateway_service import (
    get_gateway_status,
    start_webdav, stop_webdav, update_webdav_config,
    mount_fuse, unmount_fuse, update_fuse_config,
    get_fuse_status, test_webdav,
)
from app.logging_config import get_logger

router = APIRouter(prefix="/gateways", tags=["gateways"])
logger = get_logger("gateways")


@router.get("/status")
async def gateways_status():
    return await get_gateway_status()


@router.post("/webdav/start")
async def webdav_start(body: dict, _: bool = Depends(require_admin)):
    node = body.get("node", "")
    port = body.get("port")
    return await start_webdav(node, port)


@router.post("/webdav/stop")
async def webdav_stop(body: dict, _: bool = Depends(require_admin)):
    node = body.get("node", "")
    return await stop_webdav(node)


@router.put("/webdav/config")
async def webdav_config(body: dict, _: bool = Depends(require_admin)):
    node = body.get("node", "")
    port = body.get("port", 9001)
    return await update_webdav_config(node, port)


@router.post("/fuse/mount")
async def fuse_mount(body: dict, _: bool = Depends(require_admin)):
    node = body.get("node", "")
    mount_path = body.get("mount_path")
    return await mount_fuse(node, mount_path)


@router.post("/fuse/unmount")
async def fuse_unmount(body: dict, _: bool = Depends(require_admin)):
    node = body.get("node", "")
    return await unmount_fuse(node)


@router.put("/fuse/config")
async def fuse_config(body: dict, _: bool = Depends(require_admin)):
    node = body.get("node", "")
    mount_path = body.get("mount_path", "/mnt/seaweedfs")
    return await update_fuse_config(node, mount_path)


@router.get("/fuse/status")
async def fuse_status(node: str = ""):
    return await get_fuse_status(node)


@router.post("/webdav/test")
async def webdav_test(body: dict, _: bool = Depends(require_admin)):
    node = body.get("node", "")
    port = body.get("port", 9001)
    return await test_webdav(node, port)
