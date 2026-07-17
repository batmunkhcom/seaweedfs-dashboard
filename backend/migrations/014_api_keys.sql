-- API keys for backup access (no username/password)
CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    permissions TEXT NOT NULL DEFAULT 'backup:read,backup:write',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME,
    is_active INTEGER NOT NULL DEFAULT 1
);

-- Seed one default backup API key
INSERT OR IGNORE INTO api_keys (key, name, permissions) VALUES 
('bkp_' || lower(hex(randomblob(32))), 'Default Backup Key', 'backup:read,backup:write');
