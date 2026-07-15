CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO users (username, password_hash, role) VALUES
  ('admin', '$2b$12$E5CHaDxHd8hkwL2sR.F.uey2pevzUIbxjrf6dPphpiEDuy6p2D1IO', 'admin'),
  ('viewer', '$2b$12$ZlTehm4Miw1a6Hr/fQGou.f.blrSwqgtIY8kzVdvvHXxjDIz1D3ZW', 'viewer');
