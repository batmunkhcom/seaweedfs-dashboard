from pydantic import BaseModel
from typing import Optional


class MetricPoint(BaseModel):
    timestamp: float
    node: str
    metric_type: str
    value: float


class NodeMetrics(BaseModel):
    node: str
    volumes: int
    free_slots: int
    max_slots: int
    disk_usage_pct: float
    ec_shards: int
    alive: bool
    last_seen: float


class MetricsOverview(BaseModel):
    total_volumes: int
    total_free_slots: int
    total_max_slots: int
    cluster_disk_usage_pct: float
    nodes_total: int
    nodes_healthy: int
    last_updated: float


class MetricsHistoryPoint(BaseModel):
    timestamp: float
    value: float


class NodeHealthInfo(BaseModel):
    node: str
    alive: bool
    latency_ms: Optional[float] = None
    error: Optional[str] = None
