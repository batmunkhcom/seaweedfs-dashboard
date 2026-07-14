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
  <img src="https://img.shields.io/badge/license-MIT-green" />
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
- Multi-master auto-failover with audit logging

### Volume & Collection Operations
- Volume list with search, filter, sort, detail drawer
- Volume grow wizard and vacuum (garbage collection) trigger
- Collection browser with delete support

### Filer File Browser
- Directory navigation with breadcrumbs and pagination
- File upload with configurable size/type limits
- Download, delete, create folders
- File metadata viewer

### S3 Object Store
- Bucket CRUD — create, list, set quota, delete
- User management — generate access/secret key pairs
- Policy editor — JSON editor with syntax validation
- IAM identity configuration

### Backup & Restore
- Filer metadata sync trigger
- Snapshot list, create, delete
- Async backup status monitoring

### Real-time Monitoring
- Live KPI cards — volumes, files, total size, free space
- Disk usage pie chart per server
- Volume growth trend (area chart, configurable time range)
- SSE stream with automatic reconnect

### Alert Engine
- Thresholds: disk usage, node offline, garbage ratio, readonly volumes
- Lifecycle: new → acknowledged → resolved
- Deduplication — one alert per issue
- Configurable via settings page

### Disk Health (optional extension)
- S.M.A.R.T. data via SSH (`smartctl --json`)
- Temperature, wear level, reallocated sectors
- Per-disk detail pages with trend charts
- Disabled by default — enable via `DISK_HEALTH_ENABLED=true`

### Security
- Session-based authentication (admin / read-only roles)
- CSRF protection on all state-changing requests
- Rate limiting (5 failed logins / 15 min per IP)
- Structured JSON logging with audit trail

---

## Quick Start

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

### Foundation
- [ ] Phase 1 — Backend skeleton, config, logging, SeaweedFS client with failover, DB, middleware, frontend scaffold
- [ ] Phase 2 — Auth system (login, logout, CSRF, rate limit, admin guard)
- [ ] Phase 3 — Layout, navigation, sidebar, routing, dark/light theme

### Core Dashboard
- [ ] Phase 4 — Dashboard overview with 6 KPI cards, SSE real-time stream, charts, alert panel
- [ ] Phase 5 — Historical data via snapshot service (SQLite time-series)
- [ ] Phase 6 — Alert engine with configurable thresholds and lifecycle management

### Cluster Intelligence
- [ ] Phase 7 — Topology tree, master/volume/filer server tables with search
- [ ] Phase 8 — Volume management (list, grow, vacuum), collections, filer browser with upload validation
- [ ] Phase 9 — S3 buckets/users/policies, backup & restore, worker management

### Extensions
- [ ] Phase 10 — Disk health (S.M.A.R.T. via SSH, temperature/wear/realloc alerts)
- [ ] Phase 11 — Polish, tests (pytest + Vitest + Playwright), Docker deployment, documentation

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

MIT — see [LICENSE](./LICENSE).

---

<p align="center">
  Built by <a href="https://www.mbm.technology">mBm TECHNOLOGY</a>
</p>
