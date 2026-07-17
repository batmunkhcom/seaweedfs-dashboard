CREATE TABLE IF NOT EXISTS backup_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    s3_key TEXT NOT NULL,
    size_bytes INTEGER DEFAULT 0,
    filer_hosts TEXT NOT NULL,
    status TEXT DEFAULT 'uploaded',
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_backup_snapshots_status ON backup_snapshots(status);
CREATE INDEX IF NOT EXISTS idx_backup_snapshots_created ON backup_snapshots(created_at);

INSERT OR IGNORE INTO runtime_settings (key, value, description, category) VALUES
    ('backup_s3_bucket', 'seaweed-backups', 'S3 bucket name for backups', 'backup'),
    ('backup_retention_days', '30', 'Auto-delete backups older than N days', 'backup'),
    ('backup_filer_db_path', '/data/dc03/filer/filerldb2', 'Filer LevelDB directory path', 'backup'),
    ('backup_enabled', 'true', 'Enable backup feature', 'backup');
