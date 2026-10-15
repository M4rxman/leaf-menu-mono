import { test } from 'node:test'
import assert from 'node:assert/strict'
import { POOL, UI_LOCALES, bestLang, canonicalLang, dirOf, isLang, languageName, uiLocale } from '../src/langs.ts'
import { ukPlural } from '../src/plural.ts'

test('isLang accepts the pool in canonical form only', () => {
  for (const ok of ['pt', 'uk', 'ar', 'nb', 'PT']) assert.ok(isLang(ok), ok)
  for (const bad of ['xx', 'no', 'pt-BR', 'pt_BR', '', ' ', 'portuguese']) assert.ok(!isLang(bad), bad)
  assert.equal(canonicalLang('PT'), 'pt')
})

test('pool has no duplicates and every code has a display name', () => {
  assert.equal(new Set(POOL).size, POOL.length)
  for (const l of POOL) assert.ok(languageName(l).length > 0, l)
})

test('language names are native and capitalised', () => {
  assert.equal(languageName('pt'), 'Português')
  assert.equal(languageName('uk'), 'Українська')
})

test('rtl languages and UI locale fallback', () => {
  for (const l of ['ar', 'he', 'fa', 'ur']) assert.equal(dirOf(l), 'rtl', l)
  assert.equal(dirOf('pt'), 'ltr')
  assert.equal(uiLocale('uk'), 'uk')
  assert.equal(uiLocale('sw'), 'en')
  for (const l of UI_LOCALES) assert.ok(isLang(l), `${l} must be in the pool`)
})

test('bestLang honours q values, base language only, falls back', () => {
  assert.equal(bestLang('uk-UA,uk;q=0.9,en;q=0.8', ['en', 'uk'], 'en'), 'uk')
  assert.equal(bestLang('de,en;q=0.5', ['pt', 'en'], 'pt'), 'en')
  assert.equal(bestLang('*', ['pt'], 'pt'), 'pt')
  assert.equal(bestLang('en;q=0', ['en', 'pt'], 'pt'), 'pt')
  assert.equal(bestLang(null, ['pt'], 'pt'), 'pt')
})

test('Ukrainian plural forms', () => {
  const form = n => ukPlural(n)
  assert.deepEqual([1, 21, 101].map(form), [0, 0, 0])
  assert.deepEqual([2, 3, 4, 22, 104].map(form), [1, 1, 1, 1, 1])
  assert.deepEqual([0, 5, 11, 12, 14, 20, 25].map(form), [2, 2, 2, 2, 2, 2, 2])
})
