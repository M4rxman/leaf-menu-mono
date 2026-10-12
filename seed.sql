-- Casa Strega demo content (qr-menu-plan.md §12). Wireframe placeholders, not the real menu.
-- Re-runnable: deleting the restaurant cascades to everything below.
DELETE FROM restaurants WHERE slug = 'demo';

INSERT INTO restaurants (id, slug, qr_code, default_lang, info_json) VALUES
  (1, 'demo', 'cs7k2m', 'pt', '{"address":"Rua das Flores 123, Porto, Portugal","tagline":"Panizza · Aperitivo · Vino d''Italia","instagram":"https://instagram.com/","map":"https://maps.google.com/?q=Rua+das+Flores+123+Porto"}');

INSERT INTO restaurant_langs (restaurant_id, lang, position) VALUES (1, 'pt', 10), (1, 'en', 20);

INSERT INTO restaurant_i18n (restaurant_id, lang, name, about) VALUES
  (1, 'pt', 'Casa Strega', 'House of Italian Magic. Wine bar italiano no centro do Porto.'),
  (1, 'en', 'Casa Strega', 'House of Italian Magic. Italian wine bar in central Porto.');

INSERT INTO categories (id, restaurant_id, position) VALUES
  (1, 1, 10), (2, 1, 20), (3, 1, 30), (4, 1, 40), (5, 1, 50), (6, 1, 60), (7, 1, 70);

-- Italian names are proper names, kept the same in every language.
INSERT INTO category_i18n (category_id, lang, name) VALUES
  (1, 'pt', 'Aperitivo'), (1, 'en', 'Aperitivo'),
  (2, 'pt', 'Pizza al taglio'), (2, 'en', 'Pizza al taglio'),
  (3, 'pt', 'Panizza'), (3, 'en', 'Panizza'),
  (4, 'pt', 'Tagliere'), (4, 'en', 'Tagliere'),
  (5, 'pt', 'Bevande'), (5, 'en', 'Bevande'),
  (6, 'pt', 'Birre'), (6, 'en', 'Birre'),
  (7, 'pt', 'Analcolici'), (7, 'en', 'Analcolici');

INSERT INTO dishes (id, restaurant_id, category_id, position, price_cents, is_featured) VALUES
  (1, 1, 1, 10, 800, 0),
  (2, 1, 1, 20, 800, 0),
  (3, 1, 1, 30, 500, 0),
  (4, 1, 2, 10, 350, 0),
  (5, 1, 2, 20, 350, 0),
  (6, 1, 2, 30, 450, 0),
  (7, 1, 3, 10, 800, 1),
  (8, 1, 3, 20, 800, 0),
  (9, 1, 3, 30, 800, 0);

-- pt only (default language), except dish 7 in en too: the rest tests the fallback.
INSERT INTO dish_i18n (dish_id, lang, name, description) VALUES
  (1, 'pt', 'Classico Aperitivo', 'Mozzarella, Panizza, Azeitonas, Tarallini'),
  (2, 'pt', 'Veg Aperitivo', 'Fresella, Panizza, Pickles'),
  (3, 'pt', 'Aperol Spritz', 'Aperol, Prosecco, Laranja'),
  (4, 'pt', 'Margherita', 'Molho tomate, Fior di Latte, Manjericão'),
  (5, 'pt', 'Del Giorno', 'Fatia com ingrediente do dia'),
  (6, 'pt', 'Special', 'Especial da estação'),
  (7, 'pt', 'Bufalina Panizza', 'Tomate, Mozzarella di Bufala Campana, pesto'),
  (7, 'en', 'Bufalina Panizza', 'Tomato, Mozzarella di Bufala Campana, pesto'),
  (8, 'pt', 'Mortazza', 'Mortadela italiana, queijo e molho'),
  (9, 'pt', 'Calabrisella', 'Salame picante, queijo, legumes');
