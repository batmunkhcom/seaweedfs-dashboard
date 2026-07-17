# SSE Real-Time Data Flow

> Server-Sent Events (SSE) architecture for pushing live cluster data to all connected dashboard clients.

## Architecture Overview

```
┌──────────────────────────────────────────────────┐
│                   Backend (FastAPI)               │
│                                                   │
│  ┌─────────────────┐     ┌─────────────────────┐  │
│  │ SnapshotService  │     │    AlertEngine       │  │
│  │ (polls /60s)     │     │ (evaluates thresholds)│  │
│  └────────┬────────┘     └──────────┬──────────┘  │
│           │                         │              │
│           ▼                         ▼              │
│  ┌──────────────────────────────────────────────┐  │
│  │            SseManager (broadcast)            │  │
│  │                                              │  │
│  │  _subscribers: [Queue, Queue, Queue, ...]   │  │
│  └────────────────────┬─────────────────────────┘  │
│                       │                            │
│  ┌────────┐  ┌────────┐  ┌────────┐               │
│  │Client 1│  │Client 2│  │Client 3│  ...           │
│  └────────┘  └────────┘  └────────┘               │
│    SSE         SSE         SSE                     │
└──────────────────────────────────────────────────┘
```

| Component | Interval | Role |
|-----------|----------|------|
| `SseManager` | On-demand | Registers clients, broadcasts events |
| `SnapshotService` | Every 60s | Polls cluster, stores to SQLite, triggers `publish_stats` |
| `AlertEngine` | Every 60s | Evaluates thresholds, sends `alert_new`/`alert_acknowledged`/`alert_resolved` |
| `Dashboard stats endpoint` | On GET | Immediately publishes latest stats via SSE |

## Full Sequence

```mermaid
sequenceDiagram
    participant UI1 as Dashboard Client 1
    participant UI2 as Dashboard Client 2
    participant SSE as /api/dashboard/sse (SSE endpoint)
    participant Manager as SseManager (in-memory queues)
    participant Poller as SnapshotService (60s loop)
    participant DB as SQLite (snapshots table)
    participant AlertE as AlertEngine
    participant Cluster as SeaweedFS Cluster

    rect rgb(240, 248, 255)
        Note over UI1,Manager: 1. Connection Phase
        UI1->>SSE: GET /api/dashboard/sse (EventSource)
        SSE->>Manager: register_subscriber() → new asyncio.Queue(maxsize=64)
        SSE-->>UI1: HTTP 200, Content-Type: text/event-stream
        Note over SSE,UI1: Connection stays open indefinitely

        UI2->>SSE: GET /api/dashboard/sse (EventSource)
        SSE->>Manager: register_subscriber() → new asyncio.Queue(maxsize=64)
        SSE-->>UI2: HTTP 200, Content-Type: text/event-stream
    end

    rect rgb(255, 248, 240)
        Note over Poller,Cluster: 2. Data Polling (every 60s)
        Poller->>Cluster: GET /dir/status, GET /cluster/status
        Cluster-->>Poller: Topology, master info, volume stats
        Poller->>DB: INSERT INTO snapshots (timestamp, total_volumes, ...)
        Poller->>Manager: publish_stats(data)

        AlertE->>Cluster: Evaluate disk usage, garbage, readonly counts
        AlertE->>AlertE: Compare against thresholds
        alt Threshold exceeded (new alert)
            AlertE->>DB: INSERT INTO alerts (type, severity, title, ...)
            AlertE->>Manager: publish_alert({ type: "alert_new", ... })
        else Threshold cleared (resolve)
            AlertE->>DB: UPDATE alerts SET status='resolved'
            AlertE->>Manager: broadcast("alert_resolved", ...)
        end
    end

    rect rgb(240, 255, 240)
        Note over Manager,UI2: 3. Broadcast & Delivery
        Manager->>Manager: Iterate _subscribers list

        par To Client 1
            Manager->>SSE: q.put_nowait({ event: "stats_update", data: "..." })
            SSE-->>UI1: event: stats_update\ndata: { "totalVolumes": 42, ... }
        and To Client 2
            Manager->>SSE: q.put_nowait({ event: "stats_update", data: "..." })
            SSE-->>UI2: event: stats_update\ndata: { "totalVolumes": 42, ... }
        end

        Note over Manager,SSE: Dead clients (QueueFull) → pruned automatically

        Manager->>SSE: q.put_nowait({ event: "alert_new", data: "..." })
        SSE-->>UI1: event: alert_new\ndata: { "type": "disk_usage", ... }
        SSE-->>UI2: event: alert_new\ndata: { "type": "disk_usage", ... }

        UI1-->>UI1: React: update KPI cards, charts, alert panel
        UI2-->>UI2: React: update KPI cards, charts, alert panel
    end

    rect rgb(248, 248, 248)
        Note over SSE,UI2: 4. Keepalive
        SSE->>SSE: 15s timeout with no events
        SSE-->>UI1: : keepalive (comment line)
        SSE-->>UI2: : keepalive (comment line)
        Note over UI1,UI2: Browser ignores comment, connection stays alive
    end

    rect rgb(255, 240, 240)
        Note over UI2,SSE: 5. Disconnect & Reconnect
        UI2--XSSE: Network drop / browser tab closed
        SSE->>Manager: unregister_subscriber(q)
        Manager->>Manager: Remove queue from _subscribers

        Note over UI2: After reconnect (exponential backoff)
        UI2->>SSE: GET /api/dashboard/sse (reconnect)
        SSE->>Manager: register_subscriber() → new queue
        SSE-->>UI2: HTTP 200, Content-Type: text/event-stream
    end
```

## Step-by-Step Explanation

### 1. Client Connection

The frontend initializes an `EventSource` pointed at `/api/dashboard/sse`:

```typescript
const source = new EventSource('/api/dashboard/sse', { withCredentials: true });
```

The backend (`routes/sse.py`) creates a **per-client `asyncio.Queue`** (max 64 messages) and registers it in the global `_subscribers` list. The response is an `EventSourceResponse` from the `sse-starlette` library — a streaming HTTP response with `Content-Type: text/event-stream`.

### 2. Data Polling & Publishing

**SnapshotService** (60s interval):
- Polls the master API (`/dir/status`, `/cluster/status`) once every 60 seconds (configurable via `SNAPSHOT_INTERVAL_SECONDS` in `runtime_settings`).
- Stores the raw stats into the `snapshots` SQLite table for historical queries.
- Calls `publish_stats(data)` which broadcasts to all connected clients.

**Dashboard stats endpoint** (`GET /api/dashboard/stats`):
- Also calls `publish_stats(stats)` at the end of processing, so even manual page loads push fresh data to SSE subscribers.

**AlertEngine** (60s interval):
- Evaluates cluster health against threshold values from `runtime_settings`.
- Creates new alerts (`INSERT INTO alerts`) or resolves existing ones (`UPDATE alerts SET status='resolved'`).
- Broadcasts `alert_new`, `alert_acknowledged`, or `alert_resolved` events.

### 3. Broadcast Mechanism

The `broadcast(event_type, data)` function:
1. Constructs a payload: `{ "event": event_type, "data": json.dumps(data) }`.
2. Iterates the `_subscribers` list.
3. Calls `q.put_nowait(payload)` for each queue.
4. If `asyncio.QueueFull` is raised (client too slow, queue backed up with 64 messages), the queue is pruned from the subscriber list.

**No Redis required**: The current implementation uses in-memory broadcasting only. If `REDIS_URL` is set in the future, broadcast can fan out via Redis pub/sub for multi-worker deployments.

### 4. Keepalive

The `event_generator` coroutine uses `asyncio.wait_for(q.get(), timeout=15.0)`. If no data arrives within 15 seconds, it yields a **comment line** (`: keepalive`). Comments in SSE are ignored by browsers but prevent proxies (nginx, Cloudflare) from closing idle connections.

### 5. Client Disconnect & Reconnect

**Disconnect**:
- When the `EventSource` is closed (tab closed, network drop), the `await request.is_disconnected()` check triggers.
- The generator's `finally` block calls `unregister_subscriber(q)`, removing the queue from `_subscribers`.

**Reconnect** (frontend logic):
- The browser's native `EventSource` automatically reconnects on connection loss.
- Reconnection uses **exponential backoff**: 1s → 2s → 4s → 8s → … → max 30s.
- This is handled by `EventSource` itself — no custom frontend logic needed for basic reconnect.

### SSE Event Types

| Event Type | Payload | Trigger |
|------------|---------|---------|
| `stats_update` | Full dashboard stats JSON | SnapshotService poll, dashboard stats API call |
| `alert_new` | Alert object (type, severity, title, description, node) | AlertEngine threshold exceeded |
| `alert_acknowledged` | Alert ID + timestamp | Admin acknowledges alert via UI |
| `alert_resolved` | Alert ID + timestamp | Condition clears, alert auto-resolved |
| `cluster_health` | Health status (healthy/degraded/critical) | Master status check, node count change |

### Frontend Integration

```typescript
const source = new EventSource('/api/dashboard/sse');

source.addEventListener('stats_update', (e) => {
  const data = JSON.parse(e.data);
  store.updateStats(data);  // Update Zustand store → re-render KPI cards, charts
});

source.addEventListener('alert_new', (e) => {
  const alert = JSON.parse(e.data);
  store.addAlert(alert);    // Add to alert panel, show toast notification
});
```

### Component Heartbeat Monitoring

The `/api/health` endpoint reports each background service's last heartbeat from `services_health` table. The SSE stream can also carry heartbeat events from components (future enhancement).

## API Reference

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/dashboard/sse` | GET | Session (cookie) | Open SSE stream |
| `/api/dashboard/stats` | GET | Session | Get current stats (also publishes to SSE) |
| `/api/dashboard/history?hours=24` | GET | Session | Get historical snapshots |
| `/api/dashboard/alerts` | GET | Session | Get active alerts |
| `/api/dashboard/alerts/{id}/acknowledge` | PUT | Admin | Acknowledge an alert |
| `/api/dashboard/alerts/config` | GET | Session | Get alert thresholds |
| `/api/dashboard/alerts/config` | PUT | Admin | Update alert thresholds |

## Deployment Notes

- **Nginx proxy** must have `proxy_buffering off;` and `proxy_read_timeout 3600s;` for SSE passthrough.
- **Cloudflared tunnel** passes SSE cleanly (HTTP streaming is supported).
- **Single-worker** (uvicorn `--workers 1`): In-memory subscriber list is sufficient.
- **Multi-worker** (future): Requires Redis pub/sub for cross-worker broadcast.
