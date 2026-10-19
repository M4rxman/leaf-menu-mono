// Edge cases around language tags and Accept-Language, which come straight from the network.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { POOL, bestLang, canonicalLang, dirOf, isLang, languageName, uiLocale } from '../src/langs.ts'
import { ukPlural } from '../src/plural.ts'

test('canonicalLang: pool membership, case, and anything that is not a single bare tag', () => {
  assert.equal(canonicalLang('EN'), 'en')
  assert.equal(canonicalLang('pT'), 'pt')
  for (const bad of ['pt-PT', 'pt_BR', ' pt', 'pt ', 'pt,en', 'zh-Hans', 'i-klingon', '%', '😀', '*', 'x'.repeat(5000)])
    assert.equal(canonicalLang(bad), null, JSON.stringify(bad).slice(0, 30))
  assert.equal(isLang(''), false)
})

test('every pool code round-trips and is spelled in canonical (lower case) form', () => {
  for (const l of POOL) {
    assert.equal(canonicalLang(l), l)
    assert.equal(l, l.toLowerCase())
  }
})

test('dirOf is exact: only the four rtl bases, no region tags', () => {
  assert.equal(dirOf('ar'), 'rtl')
  assert.equal(dirOf('AR'), 'ltr') // callers pass canonical tags; documents that dirOf does not normalise
  assert.equal(dirOf(''), 'ltr')
  assert.equal(uiLocale(''), 'en')
  assert.equal(uiLocale('PT'), 'en') // same: canonical input expected
})

test('languageName falls back to the code for a tag Intl cannot name', () => {
  assert.ok(languageName('en').length > 0)
  assert.equal(languageName('xx').toLowerCase(), 'xx')
})

test('bestLang: optional whitespace and any case around q are valid (RFC 9110)', () => {
  assert.equal(bestLang('de, en; q=0.9', ['en', 'pt'], 'pt'), 'en')
  assert.equal(bestLang('en;Q=0.9', ['en', 'pt'], 'pt'), 'en')
  assert.equal(bestLang('  EN-gb  ', ['en'], 'pt'), 'en')
  // the weight must actually be read (not just tolerated): the lower-weighted tag loses
  assert.equal(bestLang('en;Q=0.1,pt;q=0.5', ['en', 'pt'], 'en'), 'pt')
  assert.equal(bestLang('en; q=0.1,pt;q=0.5', ['en', 'pt'], 'en'), 'pt')
  assert.equal(bestLang('en ;q=0.1, pt ; q=0.5', ['en', 'pt'], 'en'), 'pt')
})

test('bestLang: highest q wins, header order breaks ties, region is dropped', () => {
  assert.equal(bestLang('en;q=0.1,pt;q=0.9', ['en', 'pt'], 'en'), 'pt')
  assert.equal(bestLang('pt;q=0.5,en;q=0.5', ['en', 'pt'], 'en'), 'pt')
  assert.equal(bestLang('pt-BR,pt;q=0.9', ['pt'], 'en'), 'pt')
  assert.equal(bestLang('en-US,en;q=0.8,de;q=0.7', ['de'], 'pt'), 'de')
})

test('bestLang: malformed or hostile headers never throw and fall back', () => {
  for (const header of ['', ',,,', ';q=1', 'en;q=abc', 'en;q=', 'en;q=-1', 'en;q=0', '*;q=1', ';;;', '😀', 'x'.repeat(10000)])
    assert.equal(bestLang(header, ['en'], 'pt'), 'pt', JSON.stringify(header).slice(0, 30))
  assert.equal(bestLang('en', [], 'pt'), 'pt') // nothing enabled
  assert.equal(bestLang(undefined, ['en'], 'pt'), 'pt')
})

test('bestLang only returns enabled languages or the fallback', () => {
  for (const header of ['en', 'de,fr', 'zz', 'pt;q=0.1']) {
    const got = bestLang(header, ['pt', 'uk'], 'pt')
    assert.ok(['pt', 'uk'].includes(got), got)
  }
})

test('ukPlural: teens are always "many", larger numbers follow the last digits', () => {
  const form = n => ukPlural(n)
  assert.deepEqual([111, 112, 113, 114, 211].map(form), [2, 2, 2, 2, 2])
  assert.deepEqual([121, 1001, 1000001].map(form), [0, 0, 0])
  assert.deepEqual([102, 1002, 1004].map(form), [1, 1, 1])
  assert.deepEqual([0, 100, 1000, 1005].map(form), [2, 2, 2, 2])
  for (let n = 0; n < 1000; n++) assert.ok([0, 1, 2].includes(form(n)), String(n)) // always a valid form index
})
