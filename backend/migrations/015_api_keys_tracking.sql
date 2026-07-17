ALTER TABLE api_keys ADD COLUMN usage_count INTEGER DEFAULT 0;
ALTER TABLE api_keys ADD COLUMN last_used_endpoint TEXT;
ALTER TABLE api_keys ADD COLUMN created_by TEXT DEFAULT 'admin';
