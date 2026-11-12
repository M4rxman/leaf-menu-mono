-- Slug rule (CLAUDE.md): ^[a-z0-9]+(-[a-z0-9]+)*$, 3-40 chars, reserved: admin, api.
-- SQLite cannot ALTER TABLE ADD CHECK, so triggers enforce it. Existing rows are not rewritten and
-- are only re-checked if their slug is updated. GLOB has no regex, hence the combined tests.
-- slug_history is not guarded: it only ever holds slugs that restaurants already accepted.
CREATE TRIGGER restaurants_slug_insert BEFORE INSERT ON restaurants
WHEN length(NEW.slug) NOT BETWEEN 3 AND 40
  OR NEW.slug GLOB '*[^a-z0-9-]*' OR NEW.slug GLOB '-*' OR NEW.slug GLOB '*-' OR NEW.slug LIKE '%--%'
  OR NEW.slug IN ('admin', 'api')
BEGIN
  SELECT RAISE(ABORT, 'invalid slug: 3-40 chars, a-z 0-9 and single hyphens inside, not admin/api');
END;

CREATE TRIGGER restaurants_slug_update BEFORE UPDATE OF slug ON restaurants
WHEN length(NEW.slug) NOT BETWEEN 3 AND 40
  OR NEW.slug GLOB '*[^a-z0-9-]*' OR NEW.slug GLOB '-*' OR NEW.slug GLOB '*-' OR NEW.slug LIKE '%--%'
  OR NEW.slug IN ('admin', 'api')
BEGIN
  SELECT RAISE(ABORT, 'invalid slug: 3-40 chars, a-z 0-9 and single hyphens inside, not admin/api');
END;
