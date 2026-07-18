CREATE TABLE IF NOT EXISTS webhooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'generic',
    url TEXT NOT NULL,
    events TEXT NOT NULL DEFAULT '',
    secret TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    webhook_id INTEGER NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    event TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    request_body TEXT NOT NULL DEFAULT '',
    response_code INTEGER,
    response_body TEXT NOT NULL DEFAULT '',
    error TEXT NOT NULL DEFAULT '',
    duration_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries (webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries (status);

INSERT OR IGNORE INTO runtime_settings (key, value, description, category) VALUES
    ('webhooks_enabled', 'true', 'Enable webhook delivery', 'webhooks'),
    ('webhooks_retry_count', '3', 'Max delivery retry attempts', 'webhooks'),
    ('webhooks_retry_delay_seconds', '30', 'Initial retry delay in seconds', 'webhooks'),
    ('webhooks_timeout_seconds', '10', 'HTTP request timeout for webhook delivery', 'webhooks'),
    ('webhooks_max_retention_days', '30', 'Days to retain delivery history', 'webhooks');
