// LikeService rules with a spy store (no database): who may write, and when nothing is written at all.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LikeService } from '../src/domain/like-service.ts'

function spyStore({ likeable = { slug: 'demo' }, count = 5 } = {}) {
  const calls = []
  const record = name => (...args) => { calls.push([name, ...args]) }
  return {
    calls,
    findLikeable: async (...a) => { record('findLikeable')(...a); return likeable },
    setLiked: async (...a) => { record('setLiked')(...a); return count + (a[2] ? 1 : 0) },
    currentCount: async (...a) => { record('currentCount')(...a); return count },
    counts: async (...a) => { record('counts')(...a); return { 1: count } },
    likedDishIds: async (...a) => { record('likedDishIds')(...a); return [1] }
  }
}
const names = store => store.calls.map(c => c[0])

test('a dish that cannot be liked: null, and the store is never written', async () => {
  const store = spyStore({ likeable: null })
  assert.equal(await new LikeService(store).set(1, 'dev', true), null)
  assert.deepEqual(names(store), ['findLikeable'])
})

test('no device (no cookie): never writes, whatever the guest asked for', async () => {
  for (const liked of [true, false]) {
    const store = spyStore()
    const r = await new LikeService(store).set(1, null, liked)
    assert.deepEqual(r, { slug: 'demo', dishId: 1, liked: false, count: 5 })
    assert.ok(!names(store).includes('setLiked'))
  }
})

test('a device: exactly one write, with the right arguments, and the result reflects it', async () => {
  const store = spyStore()
  const like = await new LikeService(store).set(7, 'dev-a', true)
  assert.deepEqual(like, { slug: 'demo', dishId: 7, liked: true, count: 6 })
  const unlike = await new LikeService(store).set(7, 'dev-a', false)
  assert.deepEqual(unlike, { slug: 'demo', dishId: 7, liked: false, count: 5 })
  assert.deepEqual(store.calls.filter(c => c[0] === 'setLiked'), [['setLiked', 7, 'dev-a', true], ['setLiked', 7, 'dev-a', false]])
})

test('venueLikes without a device does not even query the device\'s likes', async () => {
  const store = spyStore()
  assert.deepEqual(await new LikeService(store).venueLikes('demo', null), { counts: { 1: 5 }, liked: [] })
  assert.ok(!names(store).includes('likedDishIds'))
  assert.deepEqual(await new LikeService(store).venueLikes('demo', 'dev'), { counts: { 1: 5 }, liked: [1] })
})

test('likedDishIds without a device is empty and cheap', async () => {
  const store = spyStore()
  assert.deepEqual(await new LikeService(store).likedDishIds('demo', null), [])
  assert.deepEqual(store.calls, [])
})

test('slugOf: the slug for a likeable dish, null otherwise', async () => {
  assert.equal(await new LikeService(spyStore()).slugOf(1), 'demo')
  assert.equal(await new LikeService(spyStore({ likeable: null })).slugOf(1), null)
})

test('store failures are not swallowed', async () => {
  const store = { ...spyStore(), setLiked: async () => { throw new Error('D1 down') } }
  await assert.rejects(new LikeService(store).set(1, 'dev', true), /D1 down/)
})

