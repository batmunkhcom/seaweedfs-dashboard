from prometheus_client import Counter, Gauge, Histogram, generate_latest
from prometheus_client.core import CollectorRegistry
from fastapi import Response

registry = CollectorRegistry()

http_requests_total = Counter(
    "http_requests_total", "Total HTTP requests",
    ["method", "endpoint", "status"],
    registry=registry,
)
http_request_duration_seconds = Histogram(
    "http_request_duration_seconds", "HTTP request duration",
    ["method", "endpoint"],
    registry=registry,
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10),
)
seaweed_api_requests_total = Counter(
    "seaweed_api_requests_total", "SeaweedFS API calls",
    ["host", "endpoint", "status"],
    registry=registry,
)
master_failovers_total = Counter(
    "master_failovers_total", "Master failover events",
    ["from_host", "to_host"],
    registry=registry,
)
sse_connections_active = Gauge(
    "sse_connections_active", "Active SSE connections",
    registry=registry,
)
alerts_active = Gauge(
    "alerts_active", "Active alerts by severity",
    ["severity"],
    registry=registry,
)
seaweed_volumes_total = Gauge(
    "seaweed_volumes_total", "Total volumes",
    registry=registry,
)
seaweed_disk_usage_pct = Gauge(
    "seaweed_disk_usage_pct", "Disk usage by node",
    ["node"],
    registry=registry,
)
seaweed_nodes_healthy = Gauge(
    "seaweed_nodes_healthy", "Number of healthy nodes",
    registry=registry,
)
disk_health_temperature_c = Gauge(
    "disk_health_temperature_c", "Disk temperature",
    ["node", "device"],
    registry=registry,
)
disk_health_wear_pct = Gauge(
    "disk_health_wear_pct", "Disk wear percentage",
    ["node", "device"],
    registry=registry,
)
services_healthy = Gauge(
    "services_healthy", "Background service heartbeat status",
    ["service"],
    registry=registry,
)
lifecycle_transitions_total = Counter(
    "lifecycle_transitions_total", "Lifecycle transition events",
    ["from_tier", "to_tier", "status"],
    registry=registry,
)
backups_total = Gauge(
    "backups_total", "Total backup snapshots",
    registry=registry,
)
backup_size_bytes = Gauge(
    "backup_size_bytes", "Total backup size",
    registry=registry,
)


def get_prometheus_response() -> Response:
    return Response(content=generate_latest(registry), media_type="text/plain; charset=utf-8")
