INSERT OR IGNORE INTO runtime_settings (key, value, description, category) VALUES
    ('hardening_enabled', 'false', 'Enable hardening configuration', 'hardening'),
    ('hardening_compression_algorithm', 'zstd', 'Default compression (zstd/gzip/none)', 'hardening'),
    ('hardening_compression_level', '3', 'Compression level', 'hardening'),
    ('hardening_encryption_mode', 'none', 'Encryption mode (none/SSE-S3/SSE-C)', 'hardening'),
    ('hardening_encryption_key', '', 'Encryption key (for SSE-C)', 'hardening'),
    ('hardening_replication_factor', '001', 'Default replication (e.g. 001=2 copies)', 'hardening'),
    ('hardening_checksum_enabled', 'false', 'Enable periodic checksum verification', 'hardening'),
    ('hardening_checksum_interval_hours', '168', 'Checksum verification interval (hours)', 'hardening');
