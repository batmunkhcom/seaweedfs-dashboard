INSERT OR IGNORE INTO runtime_settings (key, value, category, description) VALUES
('ai_enabled', 'false', 'ai', 'Enable AI-powered chatbot and analysis features'),
('ai_provider', 'openai', 'ai', 'AI provider: openai (OpenAI-compatible API) or ollama (local Ollama)'),
('ai_api_base_url', 'https://api.openai.com/v1', 'ai', 'AI API base URL (OpenAI-compatible endpoint)'),
('ai_api_key', '', 'ai', 'API key for the AI provider (stored encrypted)'),
('ai_model', 'gpt-4o-mini', 'ai', 'AI model name for chat completions'),
('ai_embedding_model', 'text-embedding-3-small', 'ai', 'Embedding model for RAG document indexing'),
('ai_max_tokens', '4096', 'ai', 'Maximum response tokens'),
('ai_temperature', '0.7', 'ai', 'Response temperature (0.0–2.0, lower = more deterministic)'),
('ai_system_prompt', 'You are an AI assistant for a SeaweedFS distributed storage cluster. You have access to real-time cluster metrics and can analyze the infrastructure. Answer in a helpful, concise manner. You can see: cluster topology, volume status, disk health, node information, and backup status. When answering, reference specific nodes, volumes, and metrics.', 'ai', 'System prompt for the AI chatbot'),
('timezone', 'UTC', 'general', 'System timezone for scheduling and display'),
('log_level', 'INFO', 'general', 'Logging level: DEBUG, INFO, WARNING, ERROR');
