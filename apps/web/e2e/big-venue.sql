-- A large venue for image-loading/CLS tests: 8 categories, 64 dishes, half with a photo (one shared R2 key, uploaded by serve.mjs).
INSERT INTO restaurants (id, slug, qr_code, default_lang) VALUES (3, 'big', 'big001', 'en');
INSERT INTO restaurant_langs (restaurant_id, lang, position) VALUES (3, 'en', 10);
INSERT INTO restaurant_i18n (restaurant_id, lang, name) VALUES (3, 'en', 'Big Test Venue');
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 8)
INSERT INTO categories (id, restaurant_id, position) SELECT 200 + i, 3, i * 10 FROM n;
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 8)
INSERT INTO category_i18n (category_id, lang, name) SELECT 200 + i, 'en', 'Category ' || i FROM n;
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 64)
INSERT INTO dishes (id, restaurant_id, category_id, position, price_cents, photo_key)
SELECT 200 + i, 3, 201 + (i - 1) / 8, i * 10, 500 + i * 10,
  CASE WHEN i % 2 = 0 THEN 'r/3/dishes/shared/test' END FROM n;
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 64)
INSERT INTO dish_i18n (dish_id, lang, name, description) SELECT 200 + i, 'en', 'Dish ' || i, 'Description of dish number ' || i FROM n;
