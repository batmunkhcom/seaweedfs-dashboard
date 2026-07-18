<p align="center">
  <strong>SeaweedFS Dashboard</strong> — v0.01.65
</p>

<p align="center">
  React 19 · TypeScript · FastAPI · Ant Design 5 · SQLite · Prometheus
</p>

---

Web-based management dashboard for SeaweedFS clusters. Monitor, manage, browse, and administer — volumes, filer, S3, backups, workers, disk health, ACL, lifecycle, tiers, hardening, gateways, NFS, WebDAV, FUSE.

> Built for the **dc03 production cluster** at mBm TECHNOLOGY. [seaweed.mbm.mn](https://seaweed.mbm.mn)

---

## Features

| Module | Capabilities |
|--------|-------------|
| **Dashboard** | KPI cards, real-time SSE updates, disk pie chart, volume trend charts, alert panel |
| **Cluster** | Topology tree (DC→Rack→Node), master/volume/filer tables, search/filter |
| **Volumes** | List + detail drawer, grow, vacuum, readonly/replica status |
| **Filer** | File browser with breadcrumb, upload, download, delete, mkdir |
| **S3** | Buckets CRUD, user/access-key management, IAM policy editor, key rotation |
| **Collections** | List, delete, TTL lifecycle policies |
| **ACL** | Permission rules (R/W/D/L/A), auto-sync to filer, audit log |
| **Lifecycle** | S3 bucket lifecycle policies, tier transitions, TTL parsing |
| **Tiers** | GCS/Azure cloud tier connection test, SSH deploy, sync-to-cluster |
| **Hardening** | Compression/encryption deploy via SSH, replication drift detection, checksum history |
| **Backup** | Multi-filer sync, local snapshot + S3/filer upload, cron daily at 03:00 |
| **Workers** | status overview, job history, detect/execute triggers |
| **Disk Health** | S.M.A.R.T. via SSH (smartctl), temperature/wear/realloc alerts |
| **Gateways** | WebDAV start/stop/test, FUSE mount/unmount, NFS exports management |
| **Metrics** | Node-level metrics history (disk, volumes, slots), timeseries charts |
| **Prometheus** | `/api/prometheus` — counters, histograms, gauges for HTTP, cluster, services |
| **Logs** | Loki proxy with SSE tail streaming + local structlog JSON fallback |
| **Webhooks** | Slack/Discord/Generic delivery, event filtering, secret HMAC |
| **Chatbot** | AI RAG — index codebase/docs, chat with natural language |
| **API Keys** | Create/revoke/audit API keys with permission scopes |
| **Settings** | Runtime config (thresholds, intervals, feature toggles), no restart needed |
| **Users** | Admin + viewer roles, bcrypt passwords, S3 credential binding |
| **Feedback** | Feature request board with voting and status tracking |

### Security

| Control | Detail |
|---------|--------|
| CSRF | All POST/PUT/DELETE require `X-CSRF-Token` header matching session token |
| Auth | Session-based (JWT via itsdangerous), admin/viewer roles, RBAC permissions |
| Rate limiting | Login `20/5min`, volume grow `5/min`, backup sync `2/min`, S3 secrets `10/min` |
| Sensitive data | S3 keys masked (`AKxx****xxxx`), webhook URLs stripped, SMTP/API keys hidden in settings |
| Bcrypt | All passwords hashed with bcrypt, secrets via `secrets.token_hex()` |
| SQL | All queries use `?` parameterized placeholders, no string concatenation |

### Architecture

```
[Frontend: React 19 + TS + Ant Design 5] ←→ [Backend: Python FastAPI] ←→ [SeaweedFS Cluster]
     Port 8081 (nginx)                              Port 8000 (uvicorn)        Ports 9333/8888/8333
```

- **7 background services** with heartbeat monitoring: `alert_engine`, `snapshot_service`, `lifecycle_engine`, `hardening_service`, `disk_health`, `webhook_service`, `metrics_service`
- **Multi-master failover** — auto-switch on master failure, exponential backoff
- **SSE real-time** — single persistent connection, auto-reconnect
- **Cron** — health monitor every 5min, daily backup at 03:00

## Quick Start

```bash
# Prerequisites
python3 -m venv backend/venv && source backend/venv/bin/activate
pip install -r backend/requirements.txt
cd frontend && npm install

# Configure
cp backend/.env.example backend/.env
# Edit .env with your cluster hosts and credentials

# Development mode (backend hot-reload + Vite HMR)
./manage.sh dev

# Production
./manage.sh build
./manage.sh up
```

## Manage

```bash
./manage.sh dev       # Dev mode (backend + frontend)
./manage.sh up        # Start all — backend (bg) + nginx on :8081
./manage.sh stop      # Stop everything
./manage.sh restart   # Stop + up
./manage.sh build     # Build frontend for production
./manage.sh status    # Show what's running + health check
./manage.sh lint      # Run backend + frontend linters
./manage.sh test      # Run all tests (67 backend + 26 frontend)
./manage.sh logs      # Tail backend logs
./manage.sh info      # Show ports, domain, project path
```

## Testing

```
93 tests total
├── Backend: 67 (pytest + pytest-asyncio)
│   ├── AlertEngine, SnapshotService, LifecycleEngine, HardeningService
│   ├── BackupService, GatewayService, NfsService, WebhookService
│   ├── S3, ACL, SSE, CSRF, API keys, Settings, Database
│   └── Auth routes, Health endpoint
└── Frontend: 26 (Vitest)
    ├── Component rendering, Type interfaces, Utils
    ├── RBAC, Disk health, Lifecycle TTL, NFS options
    └── IP validation, Time formatter, Alert severity
```

## Environment Variables

```bash
SEAWEEDFS_MASTER_HOSTS=10.10.95.101:9333,10.10.95.103:9333,10.10.95.105:9333
SEAWEEDFS_FILER_HOST=10.10.95.102:8888,10.10.95.104:8888
SEAWEEDFS_S3_GATEWAY_HOSTS=10.10.95.102:8333,10.10.95.104:8333,10.10.95.106:8333,10.10.95.107:8333
SEAWEEDFS_REQUEST_TIMEOUT=30
DATABASE_URL=sqlite:///data/data.db
ADMIN_USER=admin
ADMIN_PASSWORD=changeme
READONLY_USER=viewer
READONLY_PASSWORD=viewpass
SESSION_SECRET=auto-generate-random-secret
MAX_UPLOAD_SIZE_MB=500
SNAPSHOT_INTERVAL_SECONDS=60
DISK_HEALTH_ENABLED=false
```

## API

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /api/health` | public | System health + component heartbeats |
| `GET /api/info` | public | Version, endpoints, cluster metadata |
| `GET /api/prometheus` | public | Prometheus text format metrics |
| `POST /api/auth/login` | public | Session login (rate limited) |
| `GET /api/dashboard/stats` | session | Aggregated KPI + active alerts |
| `GET /api/dashboard/sse` | session | Real-time SSE event stream |
| `GET /api/cluster/status` | admin | Cluster health, topology, leader |
| `GET /api/volumes` | session | Volume list with filters |
| `GET /api/filer/list/{path}` | admin | Filer directory listing |
| `GET /api/s3/buckets` | session | S3 bucket list |
| `GET /api/s3/users` | admin | S3 user/credential management |
| `GET /api/backup/snapshots` | admin | Backup snapshot list |
| `GET /api/metrics/overview` | admin | Cluster-level metrics |
| `GET /api/logs/query` | admin | Log query (Loki or local) |
| `GET /api/webhooks` | admin | Webhook configuration |
| `GET /api/disk-health/{node}` | admin | S.M.A.R.T. data by node |
| `GET /api/feedback/requests` | admin | Feature request board |

Full API documentation at `/api-doc` in the UI.

## Deployment

```nginx
server {
    listen 8081;
    root /srv/seaweed-dashboard/frontend/dist;
    gzip on;
    gzip_types text/plain text/css application/javascript;
    location / { try_files $uri /index.html; }
    location /api/ { proxy_pass http://127.0.0.1:8000; }
}
```

```ini
# systemd: /etc/systemd/system/seaweed-dashboard.service
[Service]
WorkingDirectory=/srv/seaweed-dashboard/backend
ExecStart=/srv/seaweed-dashboard/backend/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=on-failure
```

## License

Apache 2.0 — [mBm TECHNOLOGY LLC](https://www.mbm.technology)
