INSERT OR IGNORE INTO runtime_settings (key, value, description, category) VALUES
  ('volume_size_mb', '30000', 'Volume size in MB (default 30GB)', 'cluster'),
  ('per_node_disk_gb', '1800', 'Physical disk size per node in GB', 'cluster');
