// Every UI locale file must have exactly the keys of en.json (plan v3 §7: CI fails on a missing key).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { UI_LOCALES } from '@chilly/shared/langs'

const dir = new URL('../i18n/locales/', import.meta.url)
const load = file => JSON.parse(readFileSync(new URL(file, dir), 'utf8'))

function flatten(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]])
}
// The set of names, not the count: Ukrainian has a third plural form, so it repeats {n} more often.
const placeholders = s => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]))].sort().join(',')

const en = Object.fromEntries(flatten(load('en.json')))

test('locale files match UI_LOCALES', () => {
  assert.deepEqual(readdirSync(dir).map(f => f.replace('.json', '')).sort(), [...UI_LOCALES].sort())
})

for (const lang of UI_LOCALES) {
  test(`${lang}.json has the keys of en.json, no empty values, same placeholders`, () => {
    const t = Object.fromEntries(flatten(load(`${lang}.json`)))
    assert.deepEqual(Object.keys(t).sort(), Object.keys(en).sort())
    for (const [key, value] of Object.entries(t)) {
      assert.ok(value.trim().length > 0, `${key} is empty`)
      assert.equal(placeholders(value), placeholders(en[key]), `${key} placeholders differ`)
    }
  })
}

// Keys used in templates/scripts vs keys defined: catches typos (shows the raw key to guests) and dead strings.
function sourceFiles(dirUrl) {
  return readdirSync(dirUrl, { withFileTypes: true }).flatMap((e) => {
    const child = new URL(e.name + (e.isDirectory() ? '/' : ''), dirUrl)
    return e.isDirectory() ? sourceFiles(child) : /\.(vue|ts)$/.test(e.name) ? [child] : []
  })
}
const usedKeys = new Set(
  sourceFiles(new URL('../app/', import.meta.url))
    .flatMap(f => [...readFileSync(f, 'utf8').matchAll(/\$?\bt\(\s*['"`]([\w.]+)['"`]/g)].map(m => m[1]))
)

test('every $t() key used in app/ exists in en.json', () => {
  assert.ok(usedKeys.size > 5, 'found the keys in use')
  for (const key of usedKeys) assert.ok(key in en, `${key} is used but not defined`)
})

test('every key in en.json is used somewhere in app/ (no dead strings for translators)', () => {
  for (const key of Object.keys(en)) assert.ok(usedKeys.has(key), `${key} is defined but never used`)
})

test('parameterised strings: the name of every {placeholder} is one the code passes', () => {
  assert.equal(placeholders(en['guest.like']), 'name')
  assert.equal(placeholders(en['guest.likes']), '') // count-neutral label: the number is outside the string
})
