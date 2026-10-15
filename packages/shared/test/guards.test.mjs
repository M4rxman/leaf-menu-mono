import { test } from 'node:test'
import assert from 'node:assert/strict'
import { originAllowed, parseDishId } from '../src/domain/guards.ts'

const SITE = 'https://chillymenu.example'

test('originAllowed: reads never need an Origin, in any case', () => {
  for (const m of ['GET', 'HEAD', 'OPTIONS', 'get', 'Head']) assert.ok(originAllowed(m, undefined, SITE), m)
})

test('originAllowed: every other method needs our exact origin', () => {
  for (const m of ['POST', 'PUT', 'DELETE', 'PATCH', 'post', 'FOO']) {
    assert.ok(originAllowed(m, SITE, SITE), m)
    assert.ok(!originAllowed(m, undefined, SITE), `${m} without Origin`)
    assert.ok(!originAllowed(m, null, SITE), `${m} with null header`)
  }
})

test('originAllowed: look-alike origins are rejected', () => {
  for (const origin of [
    'null', '', 'https://evil.example', 'http://chillymenu.example', 'https://chillymenu.example:8443',
    'https://chillymenu.example/', 'https://chillymenu.example.evil.example', 'https://sub.chillymenu.example',
    'HTTPS://CHILLYMENU.EXAMPLE'
  ]) assert.ok(!originAllowed('POST', origin, SITE), origin)
})

test('parseDishId: plain positive integers only', () => {
  assert.equal(parseDishId('1'), 1)
  assert.equal(parseDishId('7'), 7)
  assert.equal(parseDishId('123456789012345'), 123456789012345)
})

test('parseDishId: everything Number() would accept but a URL should not', () => {
  for (const bad of [undefined, null, '', '0', '01', '-1', '+1', '1.0', '1e3', '0x10', ' 7', '7 ', '7\n', 'abc', '7abc', 'Infinity', 'NaN',
    '1234567890123456', '9'.repeat(30)])
    assert.equal(parseDishId(bad), null, JSON.stringify(bad))
})
