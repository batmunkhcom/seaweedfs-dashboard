CREATE TABLE IF NOT EXISTS runtime_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'general'
);

INSERT OR IGNORE INTO runtime_settings (key, value, description, category) VALUES
  ('alert_disk_usage_pct', '90', 'Disk usage alert threshold (%)', 'alerts'),
  ('alert_garbage_ratio', '0.5', 'Garbage ratio threshold', 'alerts'),
  ('alert_max_readonly_volumes', '3', 'Max allowed readonly volumes', 'alerts'),
  ('max_upload_size_mb', '10240', 'Max upload file size (MB)', 'uploads'),
  ('allowed_extensions', '.jpg,.png,.pdf,.zip,.gz', 'Allowed file extensions', 'uploads'),
  ('max_files_per_upload', '10', 'Max files per batch upload', 'uploads'),
  ('snapshot_interval_seconds', '60', 'Metrics polling interval (seconds)', 'snapshot'),
  ('snapshot_retention_days', '30', 'Snapshot retention period (days)', 'snapshot'),
  ('disk_health_scan_interval_hours', '24', 'Disk health scan interval (hours)', 'disk_health'),
  ('disk_health_temp_warn_c', '55', 'Temperature warning threshold (°C)', 'disk_health'),
  ('disk_health_temp_crit_c', '65', 'Temperature critical threshold (°C)', 'disk_health'),
  ('disk_health_wear_warn_pct', '85', 'SSD wear warning threshold (%)', 'disk_health'),
  ('disk_health_realloc_warn_count', '10', 'HDD reallocated sector warning count', 'disk_health'),
  ('seaweedfs_request_timeout', '30', 'SeaweedFS API request timeout (seconds)', 'cluster');
