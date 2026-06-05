import { describe, expect, test } from 'bun:test'
import { getActiveRoofHeight, RoofSegmentNode } from '@aedifex/core'
import { roofSegmentDefinition } from '../definition'

// roof-segment handles is a constant tuple [width, depth, wallHeight, pitch, rotate].
function makeSegment(overrides: Record<string, unknown> = {}) {
  return RoofSegmentNode.parse({
    id: 'rseg_test' as never,
    type: 'roof-segment',
    ...overrides,
  })
}

describe('roofSegmentDefinition — registry contract', () => {
  test('declares roof-segment kind, schemaVersion 1, structure category, roof surfaceRole', () => {
    expect(roofSegmentDefinition.kind).toBe('roof-segment')
    expect(roofSegmentDefinition.schemaVersion).toBe(1)
    expect(roofSegmentDefinition.category).toBe('structure')
    expect(roofSegmentDefinition.surfaceRole).toBe('roof')
  })
})

describe('roofSegmentDefinition.capabilities', () => {
  test('selectable + duplicable + deletable, no movable (child of roof)', () => {
    expect(roofSegmentDefinition.capabilities.selectable?.hitVolume).toBe('bbox')
    expect(roofSegmentDefinition.capabilities.duplicable).toBe(true)
    expect(roofSegmentDefinition.capabilities.deletable).toBe(true)
    expect(roofSegmentDefinition.capabilities.movable).toBeUndefined()
  })
})

describe('roofSegmentDefinition.handles — 5-handle constant tuple', () => {
  test('exposes width + depth + wallHeight + pitch + rotate', () => {
    const handles = roofSegmentDefinition.handles as any[]
    expect(Array.isArray(handles)).toBe(true)
    expect(handles).toHaveLength(5)
    expect(handles[0].axis).toBe('x') // width
    expect(handles[1].axis).toBe('z') // depth
    expect(handles[2].axis).toBe('y') // wallHeight
    expect(handles[3].axis).toBe('y') // pitch (also y, but distinct anchor)
    expect(handles[4].kind).toBe('arc-resize')
    expect(handles[4].shape).toBe('rotate')
  })

  test('pitch handle round-trips peakHeight → pitch within 0.1°, clamps [0,85]', () => {
    // Source: pitch handle exposes floor-to-peak height as currentValue;
    // apply inverts via `getPitchFromActiveRoofHeight`. The "exact"
    // round-trip happens by applying the same drag to a node whose pitch
    // matches the new peak.
    const node = makeSegment({
      roofType: 'gable',
      width: 8,
      depth: 6,
      wallHeight: 2.5,
      pitch: 30,
    })
    const handles = roofSegmentDefinition.handles as any[]
    const pitchHandle = handles[3]
    // currentValue is wallHeight + active roof height.
    const peak = pitchHandle.currentValue(node)
    expect(peak).toBeCloseTo(node.wallHeight + getActiveRoofHeight(node), 5)

    // Round-trip: apply with the SAME peak should produce a pitch within
    // 0.1° of the original — the inverse + forward composition is the
    // identity (modulo floating-point error).
    const patch = pitchHandle.apply(node, peak)
    expect(Math.abs(patch.pitch - node.pitch)).toBeLessThan(0.1)
  })

  test('pitch handle clamps peak heights to [0,85] degrees', () => {
    const node = makeSegment({ roofType: 'gable', width: 8, depth: 6, wallHeight: 2 })
    const handles = roofSegmentDefinition.handles as any[]
    const pitchHandle = handles[3]

    // Drag the peak absurdly high — pitch should clamp to MAX_PITCH=85.
    const highPatch = pitchHandle.apply(node, 1000)
    expect(highPatch.pitch).toBe(85)

    // Drag the peak down to the wall — pitch should clamp to MIN_PITCH=0.
    const lowPatch = pitchHandle.apply(node, node.wallHeight)
    expect(lowPatch.pitch).toBe(0)
  })

  test('pitch handle.min returns the node wallHeight (peak cannot go below wall)', () => {
    const node = makeSegment({ wallHeight: 3.5 })
    const handles = roofSegmentDefinition.handles as any[]
    const min = (handles[3].min as (n: any) => number)(node)
    expect(min).toBe(3.5)
  })

  test('rotation handle negates the delta (cursor atan2 vs three.js Ry)', () => {
    const handles = roofSegmentDefinition.handles as any[]
    const rotate = handles[4]
    const patch = rotate.apply({ rotation: 1.0 } as any, 0.3)
    expect(patch.rotation).toBeCloseTo(0.7)
  })
})

describe('roofSegmentDefinition.floorplanAffordances + floorplanMoveTarget', () => {
  test('exposes roof-segment-resize + roof-segment-rotate', () => {
    expect(roofSegmentDefinition.floorplanAffordances?.['roof-segment-resize']).toBeDefined()
    expect(roofSegmentDefinition.floorplanAffordances?.['roof-segment-rotate']).toBeDefined()
  })

  test('floorplanMoveTarget is set so segment lands at world-plan cursor (not parent-local)', () => {
    // Without this the generic Path 2 fallback would write the world
    // pointer into `position`, which is roof-local for a segment.
    expect(roofSegmentDefinition.floorplanMoveTarget).toBeDefined()
  })
})

describe('roofSegmentDefinition.presentation', () => {
  test('roof-segment palette metadata is stable', () => {
    expect(roofSegmentDefinition.presentation?.label).toBe('Roof Segment')
    expect(roofSegmentDefinition.presentation?.paletteSection).toBe('structure')
    expect(roofSegmentDefinition.presentation?.paletteOrder).toBe(101)
  })
})
