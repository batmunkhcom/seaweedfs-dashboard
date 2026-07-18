INSERT OR IGNORE INTO runtime_settings (key, value, description, category) VALUES
    ('loki_enabled', 'false', 'Enable Loki log aggregation', 'logs'),
    ('loki_base_url', 'http://loki:3100', 'Loki HTTP API base URL', 'logs'),
    ('loki_org_id', '', 'Loki X-Scope-OrgID header (tenant)', 'logs'),
    ('loki_timeout_seconds', '15', 'Loki API request timeout', 'logs'),
    ('loki_default_limit', '500', 'Default log line limit', 'logs'),
    ('loki_max_limit', '5000', 'Maximum log line limit', 'logs'),
    ('loki_tail_interval_seconds', '3', 'SSE tail poll interval', 'logs');
