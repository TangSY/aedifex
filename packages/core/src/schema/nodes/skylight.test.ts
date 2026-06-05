import { describe, expect, test } from 'bun:test'
import {
  SKYLIGHT_TYPE_ORDER,
  SKYLIGHT_TYPE_PRESETS,
  SkylightNode,
  SkylightType,
} from './skylight'

function makeSkylight(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'skylight_abc',
    type: 'skylight',
    parentId: null,
    ...overrides,
  }
}

describe('SkylightNode — drift guard for SKYLIGHT_TYPE_PRESETS keys', () => {
  // This is the *same class of bug* as the validateRemoveNode whitelist
  // drift bug: if a new type is added to the enum but its preset is
  // missing (or vice-versa), shape generation breaks at runtime in
  // production but the schema parse still passes.
  test('SKYLIGHT_TYPE_PRESETS keys are EXACTLY equal to SkylightType enum members', () => {
    const presetKeys = Object.keys(SKYLIGHT_TYPE_PRESETS).sort()
    const enumValues = [...SKYLIGHT_TYPE_ORDER].sort()
    expect(presetKeys).toEqual(enumValues)
  })

  test('SKYLIGHT_TYPE_ORDER is non-empty', () => {
    expect(SKYLIGHT_TYPE_ORDER.length).toBeGreaterThan(0)
  })

  // Pin every variant: any addition / removal forces this test to be updated,
  // serving as a tripwire for silent enum drift in PRs.
  test('SKYLIGHT_TYPE_ORDER contents are pinned (drift tripwire)', () => {
    expect([...SKYLIGHT_TYPE_ORDER]).toEqual([
      'flat',
      'walk-on',
      'lantern',
      'opening',
      'sliding',
    ])
  })

  for (const variant of SKYLIGHT_TYPE_ORDER) {
    test(`SKYLIGHT_TYPE_PRESETS has an entry for variant "${variant}"`, () => {
      expect(SKYLIGHT_TYPE_PRESETS[variant]).toBeDefined()
      expect(typeof SKYLIGHT_TYPE_PRESETS[variant].label).toBe('string')
    })

    test(`SkylightNode.parse accepts skylightType="${variant}"`, () => {
      const r = SkylightNode.safeParse(makeSkylight({ skylightType: variant }))
      expect(r.success).toBe(true)
    })
  }

  test('SkylightType enum rejects unknown values', () => {
    const r = SkylightType.safeParse('totally-invalid-variant')
    expect(r.success).toBe(false)
  })
})

describe('SkylightNode — defaults', () => {
  test('defaults skylightType to "flat"', () => {
    const r = SkylightNode.parse(makeSkylight())
    expect(r.skylightType).toBe('flat')
  })

  test('defaults width/height to the flat preset', () => {
    const r = SkylightNode.parse(makeSkylight())
    const flat = SKYLIGHT_TYPE_PRESETS.flat
    expect(r.width).toBe(flat.width)
    expect(r.height).toBe(flat.height)
  })

  test('operationState clamped to [0, 1]', () => {
    expect(SkylightNode.safeParse(makeSkylight({ operationState: 1 })).success).toBe(true)
    expect(SkylightNode.safeParse(makeSkylight({ operationState: 0 })).success).toBe(true)
    expect(SkylightNode.safeParse(makeSkylight({ operationState: 1.1 })).success).toBe(false)
    expect(SkylightNode.safeParse(makeSkylight({ operationState: -0.1 })).success).toBe(false)
  })

  test('slideFraction clamped to [0, 1]', () => {
    expect(SkylightNode.safeParse(makeSkylight({ slideFraction: 1 })).success).toBe(true)
    expect(SkylightNode.safeParse(makeSkylight({ slideFraction: 0 })).success).toBe(true)
    expect(SkylightNode.safeParse(makeSkylight({ slideFraction: 1.5 })).success).toBe(false)
  })

  test('default rotation is 0 (number, not tuple)', () => {
    const r = SkylightNode.parse(makeSkylight())
    expect(r.rotation).toBe(0)
  })

  test('default position is [0, 0, 0]', () => {
    const r = SkylightNode.parse(makeSkylight())
    expect(r.position).toEqual([0, 0, 0])
  })
})
