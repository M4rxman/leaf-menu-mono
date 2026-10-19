import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newDeviceId, signDevice, verifyDevice } from '../src/domain/device.ts'

test('device cookie round-trips and rejects tampering', async () => {
  const id = newDeviceId()
  const cookie = await signDevice(id, 's3cret')
  assert.equal(await verifyDevice(cookie, 's3cret'), id)
  assert.equal(await verifyDevice(cookie, 'other-secret'), null)
  assert.equal(await verifyDevice(`${newDeviceId()}.${cookie.split('.').pop()}`, 's3cret'), null)
  for (const bad of [undefined, '', 'nodot', '.sig', `${id}.`, `${id}.!!!`]) assert.equal(await verifyDevice(bad, 's3cret'), null)
})

test('ids are unique and uuid-shaped; signing is deterministic per id and secret', async () => {
  const ids = new Set(Array.from({ length: 200 }, newDeviceId))
  assert.equal(ids.size, 200)
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  const [id] = ids
  assert.equal(await signDevice(id, 's'), await signDevice(id, 's'))
  assert.notEqual(await signDevice(id, 's'), await signDevice(id, 't'))
})

test('a cookie signed for one id cannot be reused for another', async () => {
  const a = await signDevice('device-a', 'k')
  const sig = a.split('.').pop()
  assert.equal(await verifyDevice(`device-b.${sig}`, 'k'), null)
  assert.equal(await verifyDevice(`device-a.${sig}`, 'k'), 'device-a')
  const upper = (await signDevice('Device-A', 'k')).split('.').pop()
  assert.equal(await verifyDevice(`device-a.${upper}`, 'k'), null) // ids are case-sensitive
  assert.equal(await verifyDevice(`Device-A.${upper}`, 'k'), 'Device-A')
})

test('ids may contain dots and unicode: the signature is split off the last dot', async () => {
  for (const id of ['a.b.c', 'üñí-😀', 'x']) assert.equal(await verifyDevice(await signDevice(id, 'k'), 'k'), id)
})

test('truncated, extended or bit-flipped signatures are rejected', async () => {
  const cookie = await signDevice('dev', 'k')
  const sig = cookie.slice(cookie.lastIndexOf('.') + 1)
  const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1)
  for (const bad of [`dev.${sig.slice(0, -1)}`, `dev.${sig}A`, `dev.${flipped}`, `dev.${sig}.${sig}`, `dev.${sig.toLowerCase() === sig ? sig.toUpperCase() : sig.toLowerCase()}`])
    assert.equal(await verifyDevice(bad, 'k'), null, bad)
})

test('an empty secret can neither sign nor verify (a forgeable cookie must be impossible)', async () => {
  await assert.rejects(signDevice('dev', ''))
  assert.equal(await verifyDevice(await signDevice('dev', 'k'), ''), null)
})
