-- Per-venue like limit (owner-editable in the CMS) and the counters that enforce it.
ALTER TABLE restaurants ADD COLUMN like_limit_per_min INTEGER NOT NULL DEFAULT 10
  CHECK (like_limit_per_min BETWEEN 1 AND 600);

-- Fixed one-minute windows per "ip|dishId". Old windows are pruned by the limiter itself.
CREATE TABLE rate_hits (
  key    TEXT NOT NULL,
  window INTEGER NOT NULL, -- unix minute
  n      INTEGER NOT NULL,
  PRIMARY KEY (key, window)
) WITHOUT ROWID;
CREATE INDEX rate_hits_window ON rate_hits(window);
