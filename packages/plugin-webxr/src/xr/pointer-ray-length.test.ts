import { test } from 'bun:test'
import assert from 'node:assert/strict'
import { resolvePointerRayLength } from './pointer-cursor'

test('keeps a finite aiming beam without a pointer surface hit', () => {
  assert.equal(resolvePointerRayLength(), 5)
  assert.equal(resolvePointerRayLength(Infinity), 5)
  assert.equal(resolvePointerRayLength(NaN), 5)
})

test('ends the beam at actual surfaces, including nearby placement previews', () => {
  assert.equal(resolvePointerRayLength(0.1), 0.1)
  assert.equal(resolvePointerRayLength(12), 12)
})

test('preserves configured ray limits for hands and controllers', () => {
  assert.equal(resolvePointerRayLength(undefined, 0.2), 0.2)
  assert.equal(resolvePointerRayLength(4, 0.2), 0.2)
  assert.equal(resolvePointerRayLength(0.1, 0.2), 0.1)
})
