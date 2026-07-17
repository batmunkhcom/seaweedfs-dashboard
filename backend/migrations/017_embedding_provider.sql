INSERT OR IGNORE INTO runtime_settings (key, value, category, description) VALUES
('ai_embedding_provider', 'same', 'ai', 'Embedding provider: "same" (use chat provider), "openai", or "ollama"'),
('ai_embedding_api_base_url', '', 'ai', 'Embedding API base URL. Leave empty to use chat API base URL'),
('ai_embedding_api_key', '', 'ai', 'Embedding API key. Leave empty to use chat API key');
