INSERT OR IGNORE INTO runtime_settings (key, value, description, category) VALUES
('node_volume_limits', '{"10.10.95.101:8080": 61, "10.10.95.102:8080": 61, "10.10.95.103:8080": 61, "10.10.95.104:8080": 61, "10.10.95.105:8080": 61, "10.10.95.106:8080": 61, "10.10.95.107:8080": 61}', 'Per-node volume limits (JSON: {"ip:port": count})', 'cluster');
