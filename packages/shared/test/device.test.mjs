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
