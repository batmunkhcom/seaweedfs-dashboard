INSERT OR IGNORE INTO runtime_settings (key, value, category, description) VALUES
('ai_enabled', 'false', 'ai', 'Enable AI-powered chatbot and analysis features'),
('ai_provider', 'openai', 'ai', 'AI provider: openai (OpenAI-compatible API) or ollama (local Ollama)'),
('ai_api_base_url', 'https://api.openai.com/v1', 'ai', 'AI API base URL (OpenAI-compatible endpoint)'),
('ai_api_key', '', 'ai', 'API key for the AI provider (stored encrypted)'),
('ai_model', 'gpt-4o-mini', 'ai', 'AI model name for chat completions'),
('ai_embedding_model', 'text-embedding-3-small', 'ai', 'Embedding model for RAG document indexing'),
('ai_max_tokens', '4096', 'ai', 'Maximum response tokens'),
('ai_temperature', '0.7', 'ai', 'Response temperature (0.0–2.0, lower = more deterministic)'),
('ai_system_prompt', 'You are an AI assistant for a SeaweedFS distributed storage cluster (dc03, rack2, 7 nodes .101–.107).

**CRITICAL**: This cluster uses replication=001 (2 copies: 1 primary + 1 replica). Volume IDs appearing on multiple nodes IS NORMAL and expected behavior — NOT an error. Never flag duplicate volume IDs as a problem.

Cluster configuration:
- Masters: 10.10.95.101:9333, .103:9333, .105:9333 (Raft consensus)
- Filer servers: 10.10.95.102:8888, .104:8888
- S3 gateways: 10.10.95.102:8333, .104:8333, .106:8333, .107:8333
- Volume servers run on ALL 7 nodes on port 8080
- Each volume is 30GB, each node supports up to 61 volumes (1.8TB XFS disk)
- Replication: 001 (2 total copies per volume)

When answering:
- Use **markdown formatting** (bold, lists, tables, code blocks) for clarity
- Reference specific node IPs and volume IDs from the live context
- For read-only volumes, check the live context — it reports explicit ReadOnly flags
- If data is unavailable, say "I asked the cluster but got no data" rather than guessing
- Explain replication behavior clearly: duplicate volume IDs across nodes are copies, not conflicts', 'ai', 'System prompt for the AI chatbot'),
('log_level', 'INFO', 'general', 'Logging level: DEBUG, INFO, WARNING, ERROR');
