import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { checkSize, BUDGET_BYTES } from '../scripts/check-bundle-size.mjs'

test('passes under budget, fails over it', () => {
    const small = Buffer.from('a'.repeat(10000)) // compresses to a few bytes
    assert.equal(checkSize(small).ok, true)
    assert.equal(checkSize(small, 1).ok, false)
})

test('measures gzipped size, not raw size', () => {
    const r = checkSize(Buffer.from('a'.repeat(100000)))
    assert.ok(r.size < 200)
})

test('incompressible input above 5 KB fails the default budget', () => {
    assert.equal(checkSize(randomBytes(BUDGET_BYTES + 1000)).ok, false)
})
