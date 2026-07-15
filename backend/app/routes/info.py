from fastapi import APIRouter
from app.config import settings
from app.version import VERSION

router = APIRouter(prefix="/info", tags=["info"])


@router.get("")
async def get_info():
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
            "public_dashboard": "https://seaweed.mbm.mn",
            "public_s3": "https://s3.mbm.mn",
            "internal_filer": f"http://{settings.filer_list[0].split(':')[0]}:8888",
            "internal_master": f"http://{settings.master_list[0].split(':')[0]}:9333",
        },
        "about": {
            "name": "SeaweedFS Dashboard",
            "developer": "mBm TECHNOLOGY LLC",
            "website": "https://www.mbm.technology",
        },
    }
