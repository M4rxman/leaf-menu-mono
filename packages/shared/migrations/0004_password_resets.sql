-- Self-service password reset. At most one live link per user: a new request overwrites the row, which supersedes
-- the old link in a single statement. Only the SHA-256 of the token is stored; `used` makes a link single-use.
CREATE TABLE password_resets (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL, -- unix seconds
  used       INTEGER NOT NULL DEFAULT 0 CHECK (used IN (0, 1))
);
