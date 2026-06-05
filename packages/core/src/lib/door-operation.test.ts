import { describe, expect, test } from 'bun:test'
import {
  clampDoorOperationState,
  getDoorRenderOpenAmount,
  getGarageVisibleOpeningRatio,
  isOperationDoorType,
  SECTIONAL_GARAGE_RENDER_OPEN_SCALE,
} from './door-operation'

/**
 * door-operation — small pure helpers that translate the persisted
 * `operationState` (0..1) into render values. They're called every frame for
 * every interactive door in the scene, so a regression here turns into a
 * silent visual bug (sectional garages clipping, sliding doors stuck closed,
 * doors that snap past 100% open). Pin the clamping + sectional scaling +
 * the "is this an operable door type" enum exhaustively.
 */

describe('clampDoorOperationState', () => {
  test('undefined → 0 (a brand-new door is closed)', () => {
    expect(clampDoorOperationState(undefined)).toBe(0)
  })

  test('0 → 0 (closed stays closed)', () => {
    expect(clampDoorOperationState(0)).toBe(0)
  })

  test('1 → 1 (fully open stays fully open)', () => {
    expect(clampDoorOperationState(1)).toBe(1)
  })

  test('0.5 → 0.5 (mid-range passthrough)', () => {
    expect(clampDoorOperationState(0.5)).toBe(0.5)
  })

  test('negative → 0 (lower clamp; UI sliders can drag past the rail)', () => {
    expect(clampDoorOperationState(-0.25)).toBe(0)
    expect(clampDoorOperationState(-99)).toBe(0)
  })

  test('above 1 → 1 (upper clamp; AI mutations sometimes write 2)', () => {
    expect(clampDoorOperationState(1.5)).toBe(1)
    expect(clampDoorOperationState(42)).toBe(1)
  })
})

describe('isOperationDoorType', () => {
  test.each([
    'folding',
    'pocket',
    'barn',
    'sliding',
    'garage-sectional',
    'garage-rollup',
    'garage-tiltup',
  ] as const)('%s is operable', (type) => {
    expect(isOperationDoorType(type)).toBe(true)
  })

  test('single-hinged door is NOT operable (swings via swingAngle field, not operationState)', () => {
    expect(isOperationDoorType('single')).toBe(false)
  })

  test('undefined / unknown / empty are NOT operable', () => {
    expect(isOperationDoorType(undefined)).toBe(false)
    expect(isOperationDoorType('')).toBe(false)
    expect(isOperationDoorType('not-a-real-type')).toBe(false)
  })
})

describe('getDoorRenderOpenAmount', () => {
  test('non-sectional types pass the clamped value through unchanged', () => {
    expect(getDoorRenderOpenAmount('sliding', 0.5)).toBe(0.5)
    expect(getDoorRenderOpenAmount('barn', 0)).toBe(0)
    expect(getDoorRenderOpenAmount('pocket', 1)).toBe(1)
  })

  test('sectional-garage applies the 0.88 scale (top panel never clips the lintel)', () => {
    // The constant lives next to the function for a reason — the render scale
    // must stay in sync with the geometry; this test pins them together.
    expect(getDoorRenderOpenAmount('garage-sectional', 1)).toBe(
      SECTIONAL_GARAGE_RENDER_OPEN_SCALE,
    )
    expect(getDoorRenderOpenAmount('garage-sectional', 0.5)).toBeCloseTo(
      0.5 * SECTIONAL_GARAGE_RENDER_OPEN_SCALE,
      10,
    )
  })

  test('toggle invariant: 0 → 0, 1 → max (closed↔open round-trip is total)', () => {
    // The UI "toggle" button just flips between 0 and 1. For non-sectional
    // doors that means the render value also flips between 0 and 1. For
    // sectional garages it flips 0 ↔ 0.88. Either way, two toggles must
    // return to the starting value — guard against any non-idempotent
    // clamping creeping in.
    for (const type of ['sliding', 'garage-sectional'] as const) {
      const closed = getDoorRenderOpenAmount(type, 0)
      const opened = getDoorRenderOpenAmount(type, 1)
      const reclosed = getDoorRenderOpenAmount(type, 0)
      expect(closed).toBe(0)
      expect(reclosed).toBe(closed)
      expect(opened).toBeGreaterThan(closed)
    }
  })

  test('out-of-range inputs are clamped before render scaling (no garage >0.88)', () => {
    expect(getDoorRenderOpenAmount('garage-sectional', 5)).toBe(
      SECTIONAL_GARAGE_RENDER_OPEN_SCALE,
    )
    expect(getDoorRenderOpenAmount('garage-sectional', -1)).toBe(0)
  })
})

describe('getGarageVisibleOpeningRatio', () => {
  test('sectional: reverses the 0.88 scale and saturates at 1 (no opening > door)', () => {
    // The opening ratio is `clamped / 0.88`, then `Math.min(1, …)`. So at
    // operationState=1 the raw quotient is 1.136 but the function caps it
    // at 1 — the visible opening can't be wider than the doorway.
    expect(getGarageVisibleOpeningRatio('garage-sectional', 1)).toBe(1)
    expect(getGarageVisibleOpeningRatio('garage-sectional', 0.88)).toBeCloseTo(1, 10)
    // Below the saturation point the inverse mapping passes through.
    expect(getGarageVisibleOpeningRatio('garage-sectional', 0.44)).toBeCloseTo(0.5, 10)
  })

  test('non-sectional types return the clamped operationState directly', () => {
    expect(getGarageVisibleOpeningRatio('sliding', 0.5)).toBe(0.5)
    expect(getGarageVisibleOpeningRatio('barn', 1)).toBe(1)
    expect(getGarageVisibleOpeningRatio('pocket', -0.2)).toBe(0)
  })
})
