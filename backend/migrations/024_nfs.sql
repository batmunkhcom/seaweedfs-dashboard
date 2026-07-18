CREATE TABLE IF NOT EXISTS nfs_exports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node TEXT NOT NULL,
    path TEXT NOT NULL,
    options TEXT NOT NULL DEFAULT '*(rw,sync,no_subtree_check)',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(node, path)
);

INSERT OR IGNORE INTO runtime_settings (key, value, description, category) VALUES
    ('nfs_enabled', 'false', 'Enable NFS export management', 'nfs'),
    ('nfs_ssh_user', 'root', 'SSH user for NFS management', 'nfs');
