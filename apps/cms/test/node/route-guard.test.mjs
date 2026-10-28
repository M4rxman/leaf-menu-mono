// The client route guard (app/middleware/auth.global.ts) with Nuxt's globals stubbed: who is sent where.
import assert from 'node:assert/strict'
import { test } from 'node:test'

let me
let refreshed
globalThis.defineNuxtRouteMiddleware = fn => fn
globalThis.navigateTo = path => ({ redirect: path })
globalThis.useAuth = () => ({ me: { value: me }, refresh: async () => { refreshed++; return me } })
const guard = (await import('../../app/middleware/auth.global.ts')).default

const go = async (user, path) => {
  me = user
  refreshed = 0
  return guard({ path })
}
const owner = { mustChangePassword: false }
const temporary = { mustChangePassword: true }

test('signed out: everything goes to /login, /login itself stays', async () => {
  assert.deepEqual(await go(null, '/'), { redirect: '/login' })
  assert.deepEqual(await go(null, '/password'), { redirect: '/login' })
  assert.equal(await go(null, '/login'), undefined)
})

test('signed in: /login bounces to the home page, other pages stay', async () => {
  assert.deepEqual(await go(owner, '/login'), { redirect: '/' })
  assert.equal(await go(owner, '/'), undefined)
  assert.equal(await go(owner, '/password'), undefined)
})

test('a temporary password can only reach /password', async () => {
  assert.deepEqual(await go(temporary, '/'), { redirect: '/password' })
  assert.deepEqual(await go(temporary, '/anything'), { redirect: '/password' })
  assert.equal(await go(temporary, '/password'), undefined)
})

test('the user is fetched once: a known user does not trigger a refresh', async () => {
  await go(owner, '/')
  assert.equal(refreshed, 0)
  await go(null, '/')
  assert.equal(refreshed, 1)
})
