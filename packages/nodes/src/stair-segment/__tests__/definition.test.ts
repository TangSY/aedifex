import { describe, expect, test } from 'bun:test'
import { StairSegmentNode } from '@aedifex/core'
import { stairSegmentDefinition } from '../definition'

function makeSegment(overrides: Record<string, unknown> = {}) {
  return StairSegmentNode.parse({
    id: 'sseg_test' as never,
    type: 'stair-segment',
    ...overrides,
  })
}

describe('stairSegmentDefinition — registry contract', () => {
  test('declares stair-segment kind, schemaVersion 1, structure category', () => {
    expect(stairSegmentDefinition.kind).toBe('stair-segment')
    expect(stairSegmentDefinition.schemaVersion).toBe(1)
    expect(stairSegmentDefinition.category).toBe('structure')
    expect(stairSegmentDefinition.surfaceRole).toBe('joinery')
  })
})

describe('stairSegmentDefinition.capabilities', () => {
  test('selectable + deletable but NOT duplicable (segment is owned by parent stair)', () => {
    expect(stairSegmentDefinition.capabilities.selectable?.hitVolume).toBe('bbox')
    expect(stairSegmentDefinition.capabilities.deletable).toBe(true)
    // Source: `duplicable: false` — segments are managed via the parent
    // stair's chain composition, not duplicated as standalone nodes.
    expect(stairSegmentDefinition.capabilities.duplicable).toBe(false)
  })

  test('movable is OMITTED — segment position is driven by its parent stair chain', () => {
    expect(stairSegmentDefinition.capabilities.movable).toBeUndefined()
  })
})

describe('stairSegmentDefinition.handles — width arrow anchors per side', () => {
  test('"left" width handle uses anchor="max" + rotationY=π (drag -X grows width)', () => {
    // Source: `anchor: side === 'right' ? 'min' : 'max'` and
    // `rotationY: () => side === 'right' ? 0 : Math.PI`.
    const handles = (stairSegmentDefinition.handles as (n: any) => any[])(
      makeSegment({ segmentType: 'stair' }),
    )
    const left = handles[0]
    expect(left.axis).toBe('x')
    expect(left.anchor).toBe('max')
    expect(left.placement.rotationY()).toBeCloseTo(Math.PI)
  })

  test('"right" width handle uses anchor="min" + rotationY=0 (drag +X grows width)', () => {
    const handles = (stairSegmentDefinition.handles as (n: any) => any[])(
      makeSegment({ segmentType: 'stair' }),
    )
    const right = handles[1]
    expect(right.axis).toBe('x')
    expect(right.anchor).toBe('min')
    expect(right.placement.rotationY()).toBe(0)
  })

  test('left/right width handles place at ±(width/2 + offset) on the X axis', () => {
    const node = makeSegment({ width: 2, length: 3, height: 0.5, segmentType: 'stair' })
    const handles = (stairSegmentDefinition.handles as (n: any) => any[])(node)
    const left = handles[0].placement.position(node)
    const right = handles[1].placement.position(node)
    // SIDE_HANDLE_OFFSET = 0.24 (private const). Verify symmetry: left.x =
    // -right.x and both lie at z = length/2.
    expect(left[0]).toBeCloseTo(-right[0])
    expect(left[2]).toBeCloseTo(node.length / 2)
    expect(right[2]).toBeCloseTo(node.length / 2)
  })

  test('length handle is third entry (axis=z, anchor=min)', () => {
    const handles = (stairSegmentDefinition.handles as (n: any) => any[])(
      makeSegment({ segmentType: 'stair' }),
    )
    const length = handles[2]
    expect(length.axis).toBe('z')
    expect(length.anchor).toBe('min')
    // Source comment: `rotationY` is INTENTIONALLY omitted — the generic
    // renderer auto-rotates `axis: 'z'` chevrons by -π/2 already.
    expect(length.placement.rotationY).toBeUndefined()
  })

  test('stair segments get the height handle; landings do NOT', () => {
    const stair = (stairSegmentDefinition.handles as (n: any) => any[])(
      makeSegment({ segmentType: 'stair' }),
    )
    // left + right width + length + height = 4
    expect(stair).toHaveLength(4)

    const landing = (stairSegmentDefinition.handles as (n: any) => any[])(
      makeSegment({ segmentType: 'landing' }),
    )
    // left + right width + length = 3 (no height).
    expect(landing).toHaveLength(3)
  })

  test('width handle apply writes `width` field (not center/position)', () => {
    // Source comment: "We just write `width` and let the chain re-center."
    const handles = (stairSegmentDefinition.handles as (n: any) => any[])(
      makeSegment({ segmentType: 'stair' }),
    )
    expect(handles[0].apply({} as any, 1.5)).toEqual({ width: 1.5 })
    expect(handles[1].apply({} as any, 1.5)).toEqual({ width: 1.5 })
  })

  test('all width/length/height handles use portal="grandparent"', () => {
    // Source: handles are rendered at the chain-grandparent so they don't
    // get clipped by the segment's local frame.
    const handles = (stairSegmentDefinition.handles as (n: any) => any[])(
      makeSegment({ segmentType: 'stair' }),
    )
    expect(handles[0].portal).toBe('grandparent')
    expect(handles[1].portal).toBe('grandparent')
    expect(handles[2].portal).toBe('grandparent')
    expect(handles[3].portal).toBe('grandparent')
  })
})

describe('stairSegmentDefinition.presentation', () => {
  test('stair-segment palette metadata is stable', () => {
    expect(stairSegmentDefinition.presentation?.label).toBe('Stair Segment')
    expect(stairSegmentDefinition.presentation?.paletteSection).toBe('structure')
    expect(stairSegmentDefinition.presentation?.paletteOrder).toBe(111)
  })
})
