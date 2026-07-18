import time
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
from app.metrics.prometheus import http_requests_total, http_request_duration_seconds


class MetricsMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp):
        super().__init__(app)

    async def dispatch(self, request, call_next):
        start = time.monotonic()
        response = await call_next(request)
        duration = time.monotonic() - start
        try:
            route = request.url.path
            if route.startswith("/api/"):
                segments = route.split("?")[0].split("/")
                normalized = ["api"]
                for seg in segments[2:]:
                    if not seg:
                        continue
                    if seg.isdigit() or (len(seg) >= 20 and seg.count("-") >= 2):
                        seg = "{id}"
                    normalized.append(seg)
                route = "/" + "/".join(normalized)
        except Exception:
            route = request.url.path
        http_requests_total.labels(method=request.method, endpoint=route, status=str(response.status_code)).inc()
        http_request_duration_seconds.labels(method=request.method, endpoint=route).observe(duration)
        return response
