-- Schema v1 (qr-menu-plan.md §6). Language-neutral fields on main tables, text in *_i18n.
-- Launch languages: en, pt, es, de, uk, fr.

CREATE TABLE restaurants (
  id           INTEGER PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  qr_code      TEXT NOT NULL UNIQUE, -- printed on paper: never editable
  default_lang TEXT NOT NULL CHECK (default_lang IN ('en','pt','es','de','uk','fr')),
  currency     TEXT NOT NULL DEFAULT 'EUR',
  info_json    TEXT NOT NULL DEFAULT '{}', -- address, phone, socials, map link
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at   TEXT
);

CREATE TABLE restaurant_langs (
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  lang          TEXT NOT NULL CHECK (lang IN ('en','pt','es','de','uk','fr')),
  position      INTEGER NOT NULL,
  PRIMARY KEY (restaurant_id, lang)
);

CREATE TABLE restaurant_i18n (
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  lang          TEXT NOT NULL CHECK (lang IN ('en','pt','es','de','uk','fr')),
  name          TEXT NOT NULL,
  about         TEXT,
  hours_text    TEXT,
  PRIMARY KEY (restaurant_id, lang)
);

-- Old slugs 301 to the current one.
CREATE TABLE slug_history (
  old_slug      TEXT PRIMARY KEY,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE
);

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL, -- algo$iter$salt$hash
  role          TEXT NOT NULL,
  restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE CASCADE,
  CHECK ((role = 'admin' AND restaurant_id IS NULL) OR (role = 'owner' AND restaurant_id IS NOT NULL))
);
CREATE UNIQUE INDEX one_owner_per_restaurant ON users(restaurant_id) WHERE role = 'owner';

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY, -- SHA-256 of the token
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL  -- unix seconds
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expires ON sessions(expires_at);

CREATE TABLE categories (
  id            INTEGER PRIMARY KEY,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  parent_id     INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL,
  is_visible    INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at    TEXT
);

CREATE TABLE category_i18n (
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  lang        TEXT NOT NULL CHECK (lang IN ('en','pt','es','de','uk','fr')),
  name        TEXT NOT NULL,
  PRIMARY KEY (category_id, lang)
);

CREATE TABLE dishes (
  id            INTEGER PRIMARY KEY,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  category_id   INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL,
  price_cents   INTEGER NOT NULL CHECK (price_cents >= 0), -- one price per dish
  photo_key     TEXT, -- R2 key, not a URL
  is_visible    INTEGER NOT NULL DEFAULT 1,
  is_sold_out   INTEGER NOT NULL DEFAULT 0,
  is_featured   INTEGER NOT NULL DEFAULT 0,
  allergens     TEXT, -- comma-separated codes
  likes         INTEGER NOT NULL DEFAULT 0, -- kept in sync by likes_ai / likes_ad
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  deleted_at    TEXT
);
CREATE INDEX dishes_menu ON dishes(restaurant_id, category_id, position);

CREATE TABLE dish_i18n (
  dish_id     INTEGER NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  lang        TEXT NOT NULL CHECK (lang IN ('en','pt','es','de','uk','fr')),
  name        TEXT NOT NULL,
  description TEXT,
  photo_alt   TEXT,
  PRIMARY KEY (dish_id, lang)
);

CREATE TABLE likes (
  dish_id   INTEGER NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  PRIMARY KEY (dish_id, device_id)
);
CREATE INDEX likes_device ON likes(device_id);

-- INSERT OR IGNORE of an existing like doesn't fire, so retries are idempotent.
CREATE TRIGGER likes_ai AFTER INSERT ON likes BEGIN
  UPDATE dishes SET likes = likes + 1 WHERE id = NEW.dish_id;
END;
CREATE TRIGGER likes_ad AFTER DELETE ON likes BEGIN
  UPDATE dishes SET likes = likes - 1 WHERE id = OLD.dish_id;
END;
