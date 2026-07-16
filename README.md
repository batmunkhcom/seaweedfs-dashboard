<p align="center">
  <img src="https://raw.githubusercontent.com/seaweedfs/seaweedfs/master/note/seaweedfs.png" height="80" alt="SeaweedFS" />
</p>

<h1 align="center">SeaweedFS Dashboard</h1>

<p align="center">
  <strong>Modern web-based management dashboard for SeaweedFS</strong><br/>
  Monitor clusters, manage volumes, browse files, administer S3 buckets — all in one place.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/react-19-61DAFB?logo=react" />
  <img src="https://img.shields.io/badge/typescript-5-3178C6?logo=typescript" />
  <img src="https://img.shields.io/badge/fastapi-0.115-009688?logo=fastapi" />
  <img src="https://img.shields.io/badge/python-3.11+-3776AB?logo=python" />
  <img src="https://img.shields.io/badge/antd-5-0170FE?logo=antdesign" />
  <img src="https://img.shields.io/badge/license-Apache%202.0-blue" />
</p>

---

## What is SeaweedFS Dashboard?

[SeaweedFS](https://github.com/seaweedfs/seaweedfs) is an excellent distributed file system — but managing it via raw API calls is tedious. This dashboard puts a clean, reactive UI on top, turning system administration into a visual, intuitive experience.

> Built for the **dc03 production cluster** at mBm TECHNOLOGY — now open sourced.

### Why another dashboard?

SeaweedFS ships with a built-in web UI, but it's minimal. This project adds:

- **Full S3 management** — buckets, users, policies, all with a UI
- **Real-time monitoring** via Server-Sent Events — no polling, no stale data
- **Historical trends** — volume growth, disk usage over time
- **Smart alerts** — configurable thresholds with acknowledge/resolve lifecycle
- **Filer file browser** — upload, download, delete with validation
- **Backup & restore** — filer metadata snapshots at your fingertips
- **Disk health** — S.M.A.R.T. monitoring across all nodes

---

## Architecture

```
Browser                    Backend (BFF)                SeaweedFS Cluster
┌──────────┐    HTTP     ┌──────────────┐    httpx     ┌─────────────────┐
│ React 19 │ ◄─────────► │ FastAPI      │ ◄──────────► │ Master  (x3)    │
│ Antd 5   │    SSE      │ structlog    │              │ Volume  (x7)    │
│ Recharts │             │ SQLite / PG  │              │ Filer   (x2 HA) │
│ Zustand  │             │ Redis*       │              │ S3 GW   (x4)    │
└──────────┘             └──────────────┘              └─────────────────┘
     :5173                    :8000                       :9333 :8888 :8333
```

| Layer | Stack | Why |
|-------|-------|-----|
| **Frontend** | React 19, TypeScript, Vite, Ant Design 5, Recharts, Zustand | Modern admin UI, rich components, declarative charts |
| **Backend** | Python 3.11+, FastAPI, httpx, Pydantic v2, structlog | Async proxy, multi-master failover, typed validation |
| **Database** | SQLite (default) or PostgreSQL | Lightweight, zero-config to production-ready |
| **Cache** | Redis (optional) | Rate limiting, session store, SSE pub/sub |

---

## Features

### Cluster Management
- Topology tree — DC → Rack → Node drill-down
- Master server status — leader detection, peer list, response times
- Volume server grid — disk usage, free slots, health per node
- **Per-node volume limits** — set custom max volumes per server with inline editing on cluster cards
- **Volume growth enforcement** — grow blocked automatically when any node reaches its configured limit
- Multi-master auto-failover with audit logging

### Volume & Collection Operations
- Volume list with search, filter, sort, detail drawer
- Volume grow wizard and vacuum (garbage collection) trigger
- Collection browser with delete support
- **Per-node capacity planning** — calculate volumes per node (e.g. 1.8TB / 30GB ≈ 60 volumes), set custom limits per server

### Filer File Browser
- Directory navigation with breadcrumbs and pagination
- File upload with drag-drop, multi-file, live progress, streaming chunks
- Download, delete, batch delete with confirmation modals
- Create folders, file metadata viewer
- Upload validation (configurable size/type limits)
- Operator write mode with folder/file icons

### S3 Object Store
- Bucket CRUD — create, list, set quota, delete
- User management — generate access/secret key pairs, per-user bucket policies
- **IAM sync** — auto-sync IAM users/policies to S3 gateway nodes via SSH
- Policy editor — JSON editor with syntax validation
- Readonly/readwrite permissions, masked secrets with admin password verification
- Audit logging for all S3 operations

### Backup & Restore
- Filer metadata sync trigger
- Snapshot list, create, delete
- Async backup status monitoring
- Worker management — job history, detect/execute triggers

### Real-time Monitoring
- Live KPI cards — volumes, files, total size, free space
- Disk usage pie chart per server
- Volume growth trend (area chart, configurable time range)
- SSE stream with automatic reconnect
- Dashboard stats aggregated from multiple masters/filers

### Alert Engine
- Thresholds: disk usage, node offline, garbage ratio, readonly volumes
- Lifecycle: new → acknowledged → resolved
- Deduplication — one alert per issue
- Configurable via settings page

### Disk Health (S.M.A.R.T. monitoring)
- **Lifespan estimation** — power-on hours, wear %, TBW, reallocated sectors, age warnings
- S.M.A.R.T. data via SSH (`smartctl --json`) with fallback to `lsblk`
- Temperature, wear level, reallocated sector alerts
- Per-disk detail pages with trend history
- Scheduled auto-scan (configurable interval)
- Disabled by default — enable via `DISK_HEALTH_ENABLED=true`

### Security
- Session-based authentication (admin / read-only roles)
- CSRF protection on all state-changing requests
- Rate limiting (20 failed logins / 5 min per IP)
- Structured JSON logging with audit trail
- Login error messages displayed inline
- Protected routes with admin guards

### Infrastructure Tuning
- **Sysctl hardening** — TCP optimization, memory management, file descriptor limits
- **IPv6 disabled** — eliminates AF_VSOCK errors on non-VM deployments
- **Log rotation** — journald (500MB max), syslog/auth.log/dpkg/apt auto-rotate
- **MOTD banner** — mBm ASCII art logo with live server stats on login
- **Node volume limits** — per-server capacity control, inline editing on cluster cards

### Developer Tools
- **API documentation page** — full endpoint reference with code examples
- **manage.sh** — dev/up/stop/restart/build/status/lint/test/logs/info commands
- **Template preparation** — `prepare-template.sh` for cloning systems (resets IDs, keys, logs)

## Advantages

| Feature | Default SeaweedFS UI | This Dashboard |
|---------|---------------------|----------------|
| **Cluster overview** | Basic volume count | Full topology tree, per-node health, capacity planning |
| **Real-time updates** | Manual refresh only | SSE push — instant alerts, no polling overhead |
| **Volume management** | Limited grow/vacuum | Per-node limits, inline editing, growth enforcement |
| **S3 administration** | CLI only | Full UI — buckets, users, policies, IAM sync via SSH |
| **File browser** | Minimal listing | Breadcrumbs, drag-drop upload, batch delete, metadata viewer |
| **Disk health** | Not available | S.M.A.R.T. monitoring, lifespan estimation, temperature trends |
| **Alerts** | None | Configurable thresholds, lifecycle management, deduplication |
| **Backup/Restore** | Manual commands | UI-driven snapshots, sync triggers, job tracking |
| **Security** | Basic auth | CSRF protection, rate limiting, session management, audit trail |
| **Multi-master** | Manual failover | Automatic failover with audit logging |
| **Infrastructure** | No tuning | Sysctl hardening, log rotation, template cloning support |

### Why use this dashboard?

1. **Single pane of glass** — cluster health, volumes, files, S3, backups, disk health all in one place
2. **Per-node capacity planning** — set custom volume limits per server based on actual disk capacity
3. **Real-time visibility** — SSE stream keeps everything fresh without polling
4. **Production-hardened** — CSRF, rate limiting, audit logging, structured JSON logs
5. **Template-ready** — clone systems with `prepare-template.sh`, zero manual reconfiguration
6. **Open source** — Apache 2.0, built for production at mBm TECHNOLOGY dc03 cluster

```bash
# 1. Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # ← edit your cluster endpoints
uvicorn app.main:app --reload --port 8000

# 2. Frontend
cd frontend
npm install
npm run dev                   # → http://localhost:5173
```

Vite proxies `/api` → `localhost:8000` automatically. Open `http://localhost:5173` and log in.

---

## Deployment

### Docker

```bash
docker compose up -d
```

Multi-stage build: frontend compiled to static files, served by Nginx alongside the API proxy.

### Bare Metal

```bash
# Backend systemd service on port 8000
# Nginx fronting static files on port 8081
# Reverse proxy /api → localhost:8000
```

See `AGENTS.md` for full systemd unit and Nginx config examples.

---

## Development Roadmap

### ✅ Completed (v0.83)
- [x] Phase 1 — Backend skeleton, config, logging, SeaweedFS client with failover, DB, middleware, frontend scaffold
- [x] Phase 2 — Auth system (login, logout, CSRF, rate limit, admin guard)
- [x] Phase 3 — Layout, navigation, sidebar, routing, dark/light theme, mobile responsive
- [x] Phase 4 — Dashboard overview with KPI cards, SSE real-time stream, charts, alert panel
- [x] Phase 5 — Historical data via snapshot service (SQLite time-series)
- [x] Phase 6 — Alert engine with configurable thresholds and lifecycle management
- [x] Phase 7 — Topology tree, master/volume/filer server tables with search/filter/sort
- [x] Phase 8 — Volume management (list, grow, vacuum), collections, filer browser with upload validation
- [x] Phase 9 — S3 buckets/users/policies CRUD, backup & restore, worker management, IAM sync
- [x] Phase 10 — Disk health (S.M.A.R.T. via SSH, temperature/wear/realloc alerts, lifespan estimation)

### Additional Features
- [x] Per-node volume limits with inline editing on cluster cards
- [x] Volume growth enforcement per configured node limit
- [x] Sysctl hardening (TCP, memory, file descriptors)
- [x] IPv6 disabled for non-VM deployments
- [x] Log rotation (journald 500MB, syslog/auth.log/dpkg/apt auto-rotate)
- [x] MOTD banner with mBm ASCII art and live server stats
- [x] API documentation page with full endpoint reference
- [x] manage.sh — dev/up/stop/restart/build/status/lint/test/logs/info
- [x] Template preparation script for system cloning

### Future (v2+)
- [ ] Phase 12 — Prometheus metrics integration
- [ ] Phase 13 — Webhook notifications (Slack, Discord, Email)
- [ ] Phase 14 — Log aggregation (Loki)
- [ ] Phase 15 — WebDAV + FUSE gateway management
- [ ] Phase 16 — NFS gateway management
- [ ] Phase 17 — Collections with lifecycle policies (TTL)
- [ ] Phase 18 — Filer ACL (file-level access control)
- [ ] Phase 19 — Tiered storage (S3/GCS/Azure cloud tier)
- [ ] Phase 20 — Production hardening (compression, encryption, replication tuning)
- [ ] Phase 21 — Feature request board

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SEAWEEDFS_MASTER_HOSTS` | Comma-separated master endpoints | required |
| `SEAWEEDFS_FILER_HOST` | Comma-separated filer endpoints (HA) | required |
| `DATABASE_URL` | SQLite path or PostgreSQL connection | `sqlite:///data/data.db` |
| `REDIS_URL` | Redis for cache/rate/session/SSE | optional |
| `ADMIN_USER` / `ADMIN_PASSWORD` | Admin credentials | `admin` / `changeme` |
| `READONLY_USER` / `READONLY_PASSWORD` | View-only credentials | `viewer` / `viewpass` |
| `MAX_UPLOAD_SIZE_MB` | Max file upload size | `500` |
| `SNAPSHOT_INTERVAL_SECONDS` | Metrics polling interval | `60` |
| `ALERT_DISK_USAGE_PCT` | Disk usage alert threshold | `90` |
| `DISK_HEALTH_ENABLED` | Enable S.M.A.R.T. monitoring | `false` |

Full list in `backend/.env.example`.

---

## License

Apache License 2.0 — use, modify, and distribute freely. Attribution must be retained. See [LICENSE](./LICENSE).

---

<p align="center">
  Developed by <a href="https://console.mbm.mn">mBm AI Assistant</a> at <a href="https://www.mbm.technology">mBm TECHNOLOGY</a>
</p>
