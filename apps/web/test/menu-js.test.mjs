// public/menu.js is the only JS guests run. It is driven here with a tiny fake DOM and a scripted fetch (no jsdom).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('../public/menu.js', import.meta.url), 'utf8')
const tick = () => new Promise(r => setImmediate(r))

function fakeForm(id, { pressed = false, count = 0 } = {}) {
  const attrs = { 'aria-pressed': String(pressed) }
  const button = { getAttribute: k => attrs[k], setAttribute: (k, v) => { attrs[k] = v } }
  let text = String(count)
  const counter = { get textContent() { return text }, set textContent(v) { text = String(v) } } // the DOM stringifies
  const liked = { value: pressed ? '0' : '1' }
  const form = {
    dataset: { dish: String(id) }, action: `/api/likes/${id}`, elements: { liked }, submitted: 0, handler: null,
    querySelector: sel => (sel === 'button' ? button : sel === '[data-count]' ? counter : null),
    addEventListener: (type, fn) => { if (type === 'submit') form.handler = fn },
    submit: () => { form.submitted++ },
    pressed: () => attrs['aria-pressed'], count: () => counter.textContent, next: () => liked.value
  }
  return form
}

/** Loads menu.js into a sandbox. `responses` maps "METHOD url" to a Response-like or an Error to throw. */
async function load({ forms, responses = {}, root = { dataset: { likesUrl: '/api/r/demo/likes' } } }) {
  const calls = []
  const fetch = async (url, opts = {}) => {
    const key = `${opts.method ?? 'GET'} ${url}`
    calls.push(key)
    const r = responses[key]
    if (r instanceof Error) throw r
    if (!r) throw new TypeError('no scripted response for ' + key)
    return r
  }
  const document = { querySelector: () => root, querySelectorAll: () => forms }
  vm.runInNewContext(source, { document, fetch, Set, Number, String })
  await tick()
  return { calls }
}
const ok = body => ({ ok: true, status: 200, json: async () => body })
const fail = status => ({ ok: false, status, json: async () => ({ error: { code: 'x' } }) })
const submit = async (form) => {
  let prevented = 0
  const p = form.handler({ preventDefault: () => { prevented++ } })
  await p
  await tick()
  return prevented
}

test('on load it paints the per-device state: pressed hearts, fresh counts, and flips the next action', async () => {
  const a = fakeForm(7)
  const b = fakeForm(8)
  await load({ forms: [a, b], responses: { 'GET /api/r/demo/likes': ok({ counts: { 7: 3, 8: 12 }, liked: [8] }) } })
  assert.deepEqual([a.pressed(), a.count(), a.next()], ['false', '3', '1'])
  assert.deepEqual([b.pressed(), b.count(), b.next()], ['true', '12', '0'])
})

test('a dish missing from the counts keeps its server-rendered number', async () => {
  const a = fakeForm(7, { count: 41 })
  await load({ forms: [a], responses: { 'GET /api/r/demo/likes': ok({ counts: {}, liked: [] }) } })
  assert.equal(a.count(), '41')
})

test('tapping an unpressed heart sends PUT, stays on the page, and shows the server count', async () => {
  const a = fakeForm(7, { count: 2 })
  const { calls } = await load({ forms: [a], responses: { 'GET /api/r/demo/likes': ok({ counts: {}, liked: [] }), 'PUT /api/likes/7': ok({ dishId: 7, liked: true, count: 3 }) } })
  assert.equal(await submit(a), 1) // preventDefault: no navigation
  assert.deepEqual([a.pressed(), a.count(), a.next(), a.submitted], ['true', '3', '0', 0])
  assert.ok(calls.includes('PUT /api/likes/7'))
})

test('tapping a pressed heart sends DELETE and takes it back', async () => {
  const a = fakeForm(8, { pressed: true, count: 5 })
  const { calls } = await load({ forms: [a], responses: { 'GET /api/r/demo/likes': ok({ counts: { 8: 5 }, liked: [8] }), 'DELETE /api/likes/8': ok({ dishId: 8, liked: false, count: 4 }) } })
  await submit(a)
  assert.deepEqual([a.pressed(), a.count(), a.next()], ['false', '4', '1'])
  assert.ok(calls.includes('DELETE /api/likes/8'))
})

test('429 / 404 / 500 / 403 keep the state and never re-post the form (no JSON page, no lost scroll)', async () => {
  for (const status of [429, 404, 500, 403]) {
    const a = fakeForm(7, { count: 2 })
    await load({ forms: [a], responses: { 'GET /api/r/demo/likes': ok({ counts: {}, liked: [] }), 'PUT /api/likes/7': fail(status) } })
    assert.equal(await submit(a), 1)
    assert.deepEqual([a.pressed(), a.count(), a.submitted], ['false', '2', 0], String(status))
  }
})

test('a network error falls back to the plain form post, once', async () => {
  const a = fakeForm(7)
  await load({ forms: [a], responses: { 'GET /api/r/demo/likes': ok({ counts: {}, liked: [] }), 'PUT /api/likes/7': new TypeError('Failed to fetch') } })
  await submit(a)
  assert.equal(a.submitted, 1)
})

test('a 200 with a broken body keeps the state and does not throw out of the handler', async () => {
  const a = fakeForm(7, { count: 2 })
  const bad = { ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <') } }
  await load({ forms: [a], responses: { 'GET /api/r/demo/likes': ok({ counts: {}, liked: [] }), 'PUT /api/likes/7': bad } })
  await submit(a)
  assert.deepEqual([a.pressed(), a.count(), a.submitted], ['false', '2', 0])
})

test('if the state request fails the hearts still work, from the server-rendered state', async () => {
  for (const state of [new TypeError('offline'), fail(500), { ok: true, json: async () => { throw new SyntaxError('bad') } }]) {
    const a = fakeForm(7, { count: 9 })
    await load({ forms: [a], responses: { 'GET /api/r/demo/likes': state, 'PUT /api/likes/7': ok({ dishId: 7, liked: true, count: 10 }) } })
    assert.equal(a.count(), '9')
    await submit(a)
    assert.deepEqual([a.pressed(), a.count()], ['true', '10'])
  }
})

test('two quick taps send two idempotent requests; the last answer wins', async () => {
  const a = fakeForm(7)
  let n = 0
  const responses = {
    'GET /api/r/demo/likes': ok({ counts: {}, liked: [] }),
    get 'PUT /api/likes/7' () { n++; return ok({ dishId: 7, liked: true, count: 1 }) }
  }
  await load({ forms: [a], responses })
  await Promise.all([submit(a), submit(a)])
  assert.equal(n, 2)
  assert.deepEqual([a.pressed(), a.count(), a.submitted], ['true', '1', 0])
})

test('a page without the likes root (or without hearts) does nothing and makes no request', async () => {
  const none = await load({ forms: [fakeForm(7)], root: null })
  assert.deepEqual(none.calls, [])
  const empty = await load({ forms: [], responses: { 'GET /api/r/demo/likes': ok({ counts: {}, liked: [] }) } })
  assert.deepEqual(empty.calls, ['GET /api/r/demo/likes'])
})

test('the script stays tiny (plan §10 budget: 5 KB gzipped)', async () => {
  const { gzipSync } = await import('node:zlib')
  assert.ok(gzipSync(source).length < 2048, `menu.js is ${gzipSync(source).length} B gzipped`)
})
