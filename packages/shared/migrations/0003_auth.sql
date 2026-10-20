-- Owner accounts get a temporary password from the admin; they must replace it at first login.
ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;

-- Login throttling (plan §9). The Rate Limiting binding only supports 10 s / 60 s periods, so the
-- "5 failures per 15 minutes" rule lives here. key = 'email:<lower-case>' or 'ip:<address>'.
CREATE TABLE login_failures (
  key TEXT NOT NULL,
  at  INTEGER NOT NULL -- unix seconds
);
CREATE INDEX login_failures_key ON login_failures(key, at);
