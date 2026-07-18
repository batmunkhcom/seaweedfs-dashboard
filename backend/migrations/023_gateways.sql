CREATE TABLE IF NOT EXISTS gateway_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gw_type TEXT NOT NULL,
    node TEXT NOT NULL,
    port INTEGER NOT NULL,
    mount_path TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 0,
    config_json TEXT NOT NULL DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(gw_type, node)
);

INSERT OR IGNORE INTO runtime_settings (key, value, description, category) VALUES
    ('gateways_enabled', 'false', 'Enable WebDAV/FUSE gateway management', 'gateways'),
    ('webdav_default_port', '9001', 'Default WebDAV port', 'gateways'),
    ('fuse_default_mount', '/mnt/seaweedfs', 'Default FUSE mount path', 'gateways'),
    ('gateway_ssh_user', 'root', 'SSH user for gateway management', 'gateways'),
    ('gateway_ssh_key_path', '~/.ssh/id_rsa', 'SSH key path for gateway management', 'gateways');
