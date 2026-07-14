CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp REAL NOT NULL,
    total_volumes INTEGER,
    total_files INTEGER,
    total_size_bytes INTEGER,
    free_space INTEGER,
    max_space INTEGER,
    volume_servers INTEGER,
    healthy_nodes INTEGER,
    master_leader TEXT,
    json_raw TEXT
);

CREATE INDEX IF NOT EXISTS idx_snapshots_ts ON snapshots(timestamp);

CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    severity TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    node TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    dedup_key TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    acknowledged_at TIMESTAMP,
    resolved_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_dedup ON alerts(dedup_key);

CREATE TABLE IF NOT EXISTS alert_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS services_health (
    name TEXT PRIMARY KEY,
    last_heartbeat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ttl_seconds INTEGER NOT NULL DEFAULT 120
);
