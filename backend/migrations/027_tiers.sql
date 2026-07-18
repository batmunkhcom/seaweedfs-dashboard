CREATE TABLE IF NOT EXISTS tier_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    tier_type TEXT NOT NULL DEFAULT 'hot',
    provider TEXT NOT NULL DEFAULT 'local',
    config_json TEXT NOT NULL DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO runtime_settings (key, value, description, category) VALUES
    ('tiers_enabled', 'false', 'Enable tiered storage management', 'tiers'),
    ('tiers_default_cold_provider', 's3', 'Default cold tier provider (s3/gcs/azure)', 'tiers'),
    ('tiers_cost_hot_gb_month', '0.05', 'Hot tier cost per GB/month', 'tiers');
