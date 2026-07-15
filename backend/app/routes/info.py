from fastapi import APIRouter
from app.config import settings
from app.version import VERSION
from app.settings_service import get_setting as sv_get

router = APIRouter(prefix="/info", tags=["info"])


@router.get("")
async def get_info():
    dashboard_url = await sv_get("public_dashboard_url", "https://seaweed.mbm.mn")
    s3_url = await sv_get("public_s3_url", "https://s3.mbm.mn")

    return {
        "version": VERSION,
        "cluster": {
            "name": "dc03",
            "datacenter": "dc03",
            "rack": "rack2",
            "replication": "001",
            "masters": settings.master_list,
            "filers": settings.filer_list,
            "nodes": 7,
        },
        "endpoints": {
            "public_dashboard": dashboard_url,
            "public_s3": s3_url,
            "internal_filer": f"http://{settings.filer_list[0].split(':')[0]}:8888",
            "internal_master": f"http://{settings.master_list[0].split(':')[0]}:9333",
        },
        "about": {
            "name": "SeaweedFS Dashboard",
            "developer": "mBm TECHNOLOGY LLC",
            "website": "https://www.mbm.technology",
        },
    }
