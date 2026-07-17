from pydantic import BaseModel, Field
from typing import Optional


class WorkerDiskInfo(BaseModel):
    dir: str
    total_bytes: int
    used_bytes: int
    free_bytes: int
    percent_free: float
    percent_used: float


class WorkerNode(BaseModel):
    name: str
    address: str
    capabilities: list[str] = []
    healthy: bool = False
    version: str = ""
    volumes: int = 0
    volume_ids: list[int] = []
    ec_shards: int = 0
    max_volumes: int = 0
    disk: Optional[WorkerDiskInfo] = None
    last_seen: str = ""


class WorkerStatusResponse(BaseModel):
    total: int
    healthy: int
    nodes: list[WorkerNode]


class WorkerJob(BaseModel):
    id: str
    type: str
    status: str
    duration_ms: Optional[int] = None
    error: Optional[str] = None
    created_at: str
    node: Optional[str] = None
    result: Optional[str] = None


class ExecuteRequest(BaseModel):
    type: str = Field(..., description="Job type: vacuum, compact, rebalance, health_check")
    node: str = Field(default="", description="Target node address (optional)")
    volume_param: str = Field(default="", description="Additional param: garbage threshold for vacuum, volume IDs for compact")


class DetectResponse(BaseModel):
    ok: bool
    job_id: str
    workers_found: int
    healthy: int
    unhealthy: int


class ExecuteResponse(BaseModel):
    ok: bool
    job_id: str
    type: str
    node: str
    message: str
