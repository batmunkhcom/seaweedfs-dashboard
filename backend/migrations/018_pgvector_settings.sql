-- 018_pgvector_settings: Vector store configuration (sqlite|pgvector)

INSERT OR IGNORE INTO runtime_settings (key, value, category, description, input_type) VALUES
('ai_embedding_store', 'sqlite', 'ai',
 'Vector store backend: sqlite (local, no deps) or pgvector (PostgreSQL with vector extension)',
 'select'),

('ai_pgvector_connstr', '', 'ai',
 'PostgreSQL connection string for pgvector: postgresql://user:pass@host:5432/dbname',
 'password'),

('ai_embedding_dimensions', '1536', 'ai',
 'Embedding vector dimensions (OpenAI=1536, Ollama/nomic-embed-text=768)',
 'number');
