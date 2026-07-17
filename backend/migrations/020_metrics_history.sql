CREATE TABLE IF NOT EXISTS metrics_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp REAL NOT NULL,
    node TEXT NOT NULL,
    metric_type TEXT NOT NULL,
    value REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_metrics_node_ts ON metrics_history (node, timestamp);
CREATE INDEX IF NOT EXISTS idx_metrics_type_ts ON metrics_history (metric_type, timestamp);

INSERT OR IGNORE INTO runtime_settings (key, value, description, category) VALUES
    ('metrics_poll_interval_seconds', '60', 'Metrics collection interval in seconds', 'metrics'),
    ('metrics_retention_days', '30', 'Days to retain metrics data', 'metrics'),
    ('metrics_enabled', 'true', 'Enable metrics collection', 'metrics'),
    ('metrics_node_check_timeout', '5', 'Node liveness check timeout seconds', 'metrics');
