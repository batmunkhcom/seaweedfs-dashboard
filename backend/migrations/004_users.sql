CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    firstname TEXT NOT NULL DEFAULT '',
    lastname TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'viewer',
    enabled INTEGER NOT NULL DEFAULT 1,
    s3_access_key TEXT NOT NULL DEFAULT '',
    s3_secret_key TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO users (username, password_hash, firstname, lastname, email, role) VALUES
  ('admin', '$2b$12$E5CHaDxHd8hkwL2sR.F.uey2pevzUIbxjrf6dPphpiEDuy6p2D1IO', 'System', 'Administrator', 'admin@mbm.technology', 'admin'),
  ('viewer', '$2b$12$ZlTehm4Miw1a6Hr/fQGou.f.blrSwqgtIY8kzVdvvHXxjDIz1D3ZW', 'Readonly', 'Viewer', 'viewer@mbm.technology', 'viewer');
