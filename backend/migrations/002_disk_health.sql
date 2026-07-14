CREATE TABLE IF NOT EXISTS disk_health (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node TEXT NOT NULL,
    device TEXT NOT NULL,
    timestamp REAL NOT NULL,
    smart_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_disk_health_node_device ON disk_health(node, device);
CREATE INDEX IF NOT EXISTS idx_disk_health_ts ON disk_health(timestamp);
