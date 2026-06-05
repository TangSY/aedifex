import { describe, expect, test } from 'bun:test'
import { stairDefinition } from '../definition'

// `def.handles` is a function — `(node) => HandleDescriptor[]` — because the
// arrow set is shape-dependent: straight stairs delegate to their segment
// children's handles, curved/spiral stairs render five parent-level arrows.
// Tests evaluate the function with a stair-shaped stub.
function makeStairLike(overrides: Record<string, unknown> = {}) {
  return {
    object: 'node',
    id: 'stair_test',
    type: 'stair',
    parentId: null,
    visible: true,
    metadata: {},
    stairType: 'straight',
    stepCount: 10,
    totalRise: 2.5,
    width: 1,
    innerRadius: 0.9,
    sweepAngle: Math.PI / 2,
    rotation: 0,
    ...overrides,
  }
}

describe('stairDefinition — registry contract', () => {
  test('declares stair kind, schemaVersion 1, structure category', () => {
    expect(stairDefinition.kind).toBe('stair')
    expect(stairDefinition.schemaVersion).toBe(1)
    expect(stairDefinition.category).toBe('structure')
    expect(stairDefinition.surfaceRole).toBe('joinery')
  })

  test('parametrics is declared (so isPresettable defaults to true)', () => {
    expect(stairDefinition.parametrics).toBeDefined()
  })
})

describe('stairDefinition.handles — variant-dependent arrow set', () => {
  test('straight stair returns ONLY the rotate handle (segments own their arrows)', () => {
    // Source comment: "Straight stairs have no parent-level shape arrows —
    // the segment children each render their own. The whole-stair rotation
    // gizmo is universal."
    const handlesFn = stairDefinition.handles as (n: any) => any[]
    const handles = handlesFn(makeStairLike({ stairType: 'straight' }))
    expect(handles).toHaveLength(1)
    // The lone handle is the rotate gizmo (arc-resize / shape='rotate').
    expect(handles[0].kind).toBe('arc-resize')
    expect(handles[0].shape).toBe('rotate')
  })

  test('curved stair returns 5 handles (rise, width, innerRadius, sweep×2) + rotate', () => {
    // Source: when isCurvedOrSpiral(node) is true, push 5 curved handles,
    // then push the universal rotate. Total = 6.
    const handlesFn = stairDefinition.handles as (n: any) => any[]
    const handles = handlesFn(makeStairLike({ stairType: 'curved' }))
    expect(handles).toHaveLength(6)
    // First two are linear-resize (rise + width).
    expect(handles[0].kind).toBe('linear-resize')
    expect(handles[1].kind).toBe('linear-resize')
    // Third is linear-resize (innerRadius). Fourth + fifth are arc-resize
    // sweep handles. Last is the rotate gizmo.
    expect(handles[2].kind).toBe('linear-resize')
    expect(handles[3].kind).toBe('arc-resize')
    expect(handles[4].kind).toBe('arc-resize')
    expect(handles[5].shape).toBe('rotate')
  })

  test('spiral stair behaves identically to curved (6 handles)', () => {
    const handlesFn = stairDefinition.handles as (n: any) => any[]
    const handles = handlesFn(makeStairLike({ stairType: 'spiral' }))
    expect(handles).toHaveLength(6)
  })
})

describe('stairDefinition.floorplanAffordances', () => {
  test('exposes segment + curved + rotate affordances', () => {
    const aff = stairDefinition.floorplanAffordances
    expect(aff?.['segment-width']).toBeDefined()
    expect(aff?.['segment-length']).toBeDefined()
    expect(aff?.['curved-width']).toBeDefined()
    expect(aff?.['curved-inner-radius']).toBeDefined()
    expect(aff?.['curved-sweep']).toBeDefined()
    expect(aff?.['stair-rotate']).toBeDefined()
  })
})

describe('stairDefinition.capabilities', () => {
  test('selectable + duplicable + deletable; no movable (composite owns its own move)', () => {
    expect(stairDefinition.capabilities.selectable).toBeDefined()
    expect(stairDefinition.capabilities.duplicable).toBe(true)
    expect(stairDefinition.capabilities.deletable).toBe(true)
    // Stair has no `movable` cap — the composite move (parent + segments
    // together) goes through the legacy MoveStairTool.
    expect(stairDefinition.capabilities.movable).toBeUndefined()
  })
})
