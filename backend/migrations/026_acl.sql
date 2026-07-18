CREATE TABLE IF NOT EXISTS acl_policies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    path TEXT NOT NULL DEFAULT '/',
    user_pattern TEXT NOT NULL DEFAULT '*',
    permissions TEXT NOT NULL DEFAULT 'R',
    priority INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS acl_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_name TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL DEFAULT '',
    path TEXT NOT NULL DEFAULT '',
    result TEXT NOT NULL DEFAULT 'allowed',
    details TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_acl_audit_user ON acl_audit_log (user_name);

INSERT OR IGNORE INTO runtime_settings (key, value, description, category) VALUES
    ('acl_enabled', 'false', 'Enable ACL policy management', 'acl'),
    ('acl_audit_retention_days', '30', 'Days to retain ACL audit logs', 'acl');
