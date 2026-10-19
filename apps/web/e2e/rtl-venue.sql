-- A second, Arabic-only venue for the RTL test. The demo (pt, en) stays untouched.
INSERT INTO restaurants (id, slug, qr_code, default_lang) VALUES (2, 'rtl', 'rtl001', 'ar');
INSERT INTO restaurant_langs (restaurant_id, lang, position) VALUES (2, 'ar', 10);
INSERT INTO restaurant_i18n (restaurant_id, lang, name) VALUES (2, 'ar', 'مطعم التجربة');
INSERT INTO categories (id, restaurant_id, position) VALUES (100, 2, 10);
INSERT INTO category_i18n (category_id, lang, name) VALUES (100, 'ar', 'المقبلات');
INSERT INTO dishes (id, restaurant_id, category_id, position, price_cents) VALUES (100, 2, 100, 10, 650);
INSERT INTO dish_i18n (dish_id, lang, name, description) VALUES (100, 'ar', 'حمص', 'حمص بالطحينة وزيت الزيتون');
