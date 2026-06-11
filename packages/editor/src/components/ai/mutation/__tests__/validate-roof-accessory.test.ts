/**
 * validateAddRoofAccessory — boundary coverage for the unified roof-accessory
 * validator, including the v0.9.1 upstream kinds (turbine-vent, eyebrow-vent,
 * cupola, gutter, downspout).
 *
 *  - kind whitelist: all 11 kinds accepted, unknown kinds rejected
 *  - per-kind default dimensions (turbine-vent width carries the head diameter)
 *  - roofSegmentId resolution (missing / wrong node type)
 *  - chimney-only heightAboveRidge passthrough
 *  - gutter eave snap: side picking per roofType, drip-edge pinning, derived
 *    rotation, eave-Y formula (mirrors packages/nodes/src/gutter/eave-snap.ts)
 *  - downspout gutter anchoring: gutterId required, host segment derived from
 *    the gutter, drop length auto-computed from eave height − gutter size
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockNodes: Record<string, any> = {}

vi.mock('@aedifex/core', () => ({
  useScene: { getState: () => ({ nodes: mockNodes }) },
  pointInPolygon: () => false,
  getCatalogMaterialById: () => null,
  nodeRegistry: { get: (_t: string) => ({ capabilities: { deletable: true } }) },
}))

vi.mock('@aedifex/viewer', () => ({
  useViewer: { getState: () => ({ selection: { levelId: null } }) },
}))

import {
  computeGutterEaveY,
  resolveGutterEaveSnap,
  validateAddRoofAccessory,
} from '../validate-structure'

beforeEach(() => {
  for (const key of Object.keys(mockNodes)) delete mockNodes[key]
})

const EAVE_TUCK_INWARD = 0.04
const EAVE_TUCK_UP = 0.04

function makeSegment(
  id: string,
  overrides: Partial<{
    roofType: string
    width: number
    depth: number
    wallHeight: number
    overhang: number
    pitch: number
  }> = {},
) {
  mockNodes[id] = {
    id,
    type: 'roof-segment',
    visible: true,
    metadata: {},
    children: [],
    parentId: 'roof_1',
    roofType: 'gable',
    width: 8,
    depth: 6,
    wallHeight: 0.5,
    overhang: 0.3,
    pitch: 40,
    ...overrides,
  }
  return mockNodes[id]
}

function makeGutter(
  id: string,
  overrides: Partial<{ roofSegmentId: string | undefined; size: number; outlets: any[] }> = {},
) {
  mockNodes[id] = {
    id,
    type: 'gutter',
    visible: true,
    metadata: {},
    children: [],
    parentId: 'rseg_1',
    roofSegmentId: 'rseg_1',
    position: [0, 0, 0],
    rotation: 0,
    length: 2.0,
    size: 0.13,
    outlets: [],
    ...overrides,
  }
  return mockNodes[id]
}

function call(input: Record<string, unknown>) {
  return validateAddRoofAccessory({ tool: 'add_roof_accessory', ...input })
}

// ============================================================================
// Kind whitelist
// ============================================================================

describe('validateAddRoofAccessory — kind whitelist', () => {
  const POINT_KINDS = [
    'chimney',
    'dormer',
    'skylight',
    'solar-panel',
    'ridge-vent',
    'box-vent',
    'turbine-vent',
    'eyebrow-vent',
    'cupola',
  ] as const

  it.each(POINT_KINDS)('accepts kind=%s on a valid roof-segment', (kind) => {
    makeSegment('rseg_1')
    const result = call({ kind, roofSegmentId: 'rseg_1', position: [1, 0, 1] })
    expect(result.status).toBe('valid')
    expect(result.kind).toBe(kind)
    expect(result.roofSegmentId).toBe('rseg_1')
  })

  it('accepts kind=gutter on a valid roof-segment', () => {
    makeSegment('rseg_1')
    const result = call({ kind: 'gutter', roofSegmentId: 'rseg_1', position: [1, 0, 2] })
    expect(result.status).toBe('valid')
    expect(result.kind).toBe('gutter')
  })

  it('accepts kind=downspout when a host gutter exists', () => {
    makeSegment('rseg_1')
    makeGutter('gutter_1')
    const result = call({
      kind: 'downspout',
      roofSegmentId: 'rseg_1',
      position: [0, 0, 0],
      gutterId: 'gutter_1',
    })
    expect(result.status).toBe('valid')
    expect(result.kind).toBe('downspout')
  })

  it('rejects unknown kinds with the allowed list in errorReason', () => {
    makeSegment('rseg_1')
    const result = call({ kind: 'weathervane', roofSegmentId: 'rseg_1', position: [0, 0, 0] })
    expect(result.status).toBe('invalid')
    expect(result.errorReason).toContain('Unknown roof accessory kind')
    expect(result.errorReason).toContain('turbine-vent')
    expect(result.errorReason).toContain('eyebrow-vent')
    expect(result.errorReason).toContain('cupola')
    expect(result.errorReason).toContain('gutter')
    expect(result.errorReason).toContain('downspout')
  })
})

// ============================================================================
// Per-kind default dimensions
// ============================================================================

describe('validateAddRoofAccessory — default dimensions', () => {
  it.each([
    ['turbine-vent', 0.32, 0.32],
    ['eyebrow-vent', 0.5, 0.6],
    ['cupola', 0.8, 0.8],
  ] as const)('%s defaults width/depth to schema values', (kind, width, depth) => {
    makeSegment('rseg_1')
    const result = call({ kind, roofSegmentId: 'rseg_1', position: [0, 0, 0] })
    expect(result.width).toBeCloseTo(width)
    expect(result.depth).toBeCloseTo(depth)
  })

  it('honors explicit width/depth overrides', () => {
    makeSegment('rseg_1')
    const result = call({
      kind: 'turbine-vent',
      roofSegmentId: 'rseg_1',
      position: [0, 0, 0],
      width: 0.5,
    })
    expect(result.width).toBeCloseTo(0.5)
  })

  it('only attaches heightAboveRidge for chimney', () => {
    makeSegment('rseg_1')
    const chimney = call({ kind: 'chimney', roofSegmentId: 'rseg_1', position: [0, 0, 0] })
    expect(chimney.heightAboveRidge).toBeCloseTo(1.0)
    const cupola = call({
      kind: 'cupola',
      roofSegmentId: 'rseg_1',
      position: [0, 0, 0],
      heightAboveRidge: 2.0,
    })
    expect(cupola.heightAboveRidge).toBeUndefined()
  })
})

// ============================================================================
// Roof segment resolution (shared error paths)
// ============================================================================

describe('validateAddRoofAccessory — segment resolution', () => {
  it.each(['turbine-vent', 'eyebrow-vent', 'cupola', 'gutter'] as const)(
    '%s rejects a missing roofSegmentId',
    (kind) => {
      const result = call({ kind, roofSegmentId: 'rseg_ghost', position: [0, 0, 0] })
      expect(result.status).toBe('invalid')
      expect(result.errorReason).toContain('not found')
    },
  )

  it('rejects a roofSegmentId that points to a non-segment node', () => {
    mockNodes.wall_1 = { id: 'wall_1', type: 'wall', metadata: {}, children: [] }
    const result = call({ kind: 'cupola', roofSegmentId: 'wall_1', position: [0, 0, 0] })
    expect(result.status).toBe('invalid')
    expect(result.errorReason).toContain('not a roof-segment')
  })
})

// ============================================================================
// Gutter — eave snap
// ============================================================================

describe('validateAddRoofAccessory — gutter eave snap', () => {
  it('snaps a +Z-side hit to the drip edge with rotation 0 (gable)', () => {
    const seg = makeSegment('rseg_1') // depth 6, overhang 0.3
    const result = call({ kind: 'gutter', roofSegmentId: 'rseg_1', position: [1.5, 0, 2] })
    expect(result.status).toBe('valid')
    const expectedZ = Math.max(3, 3 + 0.3 - EAVE_TUCK_INWARD)
    expect(result.position[0]).toBeCloseTo(1.5) // X stays free along the eave
    expect(result.position[1]).toBeCloseTo(computeGutterEaveY(seg))
    expect(result.position[2]).toBeCloseTo(expectedZ)
    expect(result.rotation).toBeCloseTo(0)
  })

  it('snaps a -Z-side hit with rotation π and overrides the LLM rotation', () => {
    makeSegment('rseg_1')
    const result = call({
      kind: 'gutter',
      roofSegmentId: 'rseg_1',
      position: [0, 0, -2],
      rotation: 1.23, // must be ignored — orientation comes from the snap
    })
    expect(result.position[2]).toBeCloseTo(-(3 + 0.3 - EAVE_TUCK_INWARD))
    expect(result.rotation).toBeCloseTo(Math.PI)
  })

  it('shed roofs always snap to the single low (+Z) eave', () => {
    makeSegment('rseg_1', { roofType: 'shed' })
    const result = call({ kind: 'gutter', roofSegmentId: 'rseg_1', position: [0, 0, -2.9] })
    expect(result.position[2]).toBeGreaterThan(0)
    expect(result.rotation).toBeCloseTo(0)
  })

  it('hip roofs snap 4-way: a dominant +X hit pins the +X eave with rotation π/2', () => {
    makeSegment('rseg_1', { roofType: 'hip' }) // width 8, depth 6
    const result = call({ kind: 'gutter', roofSegmentId: 'rseg_1', position: [3.9, 0, 0.5] })
    expect(result.position[0]).toBeCloseTo(4 + 0.3 - EAVE_TUCK_INWARD)
    expect(result.position[2]).toBeCloseTo(0.5) // Z stays free on ±X eaves
    expect(result.rotation).toBeCloseTo(Math.PI / 2)
  })

  it('computes eave Y with the slope drop + tuck-up formula', () => {
    const seg = makeSegment('rseg_1', { wallHeight: 2.5, overhang: 0.3, pitch: 40 })
    const expected = 2.5 - 0.3 * Math.tan((40 * Math.PI) / 180) + EAVE_TUCK_UP
    expect(computeGutterEaveY(seg)).toBeCloseTo(expected)
    const result = call({ kind: 'gutter', roofSegmentId: 'rseg_1', position: [0, 0, 2] })
    expect(result.position[1]).toBeCloseTo(expected)
  })

  it('flat roofs mount the gutter right at the deck top (no tuck-up)', () => {
    const seg = makeSegment('rseg_1', { roofType: 'flat', wallHeight: 3.0 })
    expect(computeGutterEaveY(seg)).toBeCloseTo(3.0)
  })

  it('defaults length to 2.0 and honors an explicit override', () => {
    makeSegment('rseg_1')
    const dflt = call({ kind: 'gutter', roofSegmentId: 'rseg_1', position: [0, 0, 2] })
    expect(dflt.length).toBeCloseTo(2.0)
    const long = call({ kind: 'gutter', roofSegmentId: 'rseg_1', position: [0, 0, 2], length: 6 })
    expect(long.length).toBeCloseTo(6)
  })

  it('resolveGutterEaveSnap pins the -X side for dominant -X hits on hip roofs', () => {
    const seg = makeSegment('rseg_1', { roofType: 'hip' })
    const snap = resolveGutterEaveSnap(seg, -3.9, 0.2)
    expect(snap.eaveX).toBeCloseTo(-(4 + 0.3 - EAVE_TUCK_INWARD))
    expect(snap.rotation).toBeCloseTo(-Math.PI / 2)
  })
})

// ============================================================================
// Downspout — gutter anchoring
// ============================================================================

describe('validateAddRoofAccessory — downspout', () => {
  it('requires gutterId', () => {
    makeSegment('rseg_1')
    const result = call({ kind: 'downspout', roofSegmentId: 'rseg_1', position: [0, 0, 0] })
    expect(result.status).toBe('invalid')
    expect(result.errorReason).toContain('gutterId')
    expect(result.errorReason).toContain('kind="gutter"')
  })

  it('rejects an unknown gutterId', () => {
    makeSegment('rseg_1')
    const result = call({
      kind: 'downspout',
      roofSegmentId: 'rseg_1',
      position: [0, 0, 0],
      gutterId: 'gutter_ghost',
    })
    expect(result.status).toBe('invalid')
    expect(result.errorReason).toContain('not found')
  })

  it('rejects a gutterId that points to a non-gutter node', () => {
    makeSegment('rseg_1')
    const result = call({
      kind: 'downspout',
      roofSegmentId: 'rseg_1',
      position: [0, 0, 0],
      gutterId: 'rseg_1',
    })
    expect(result.status).toBe('invalid')
    expect(result.errorReason).toContain('not a gutter')
  })

  it('rejects a gutter whose host roof-segment is missing', () => {
    makeGutter('gutter_1', { roofSegmentId: undefined })
    const result = call({
      kind: 'downspout',
      roofSegmentId: '',
      position: [0, 0, 0],
      gutterId: 'gutter_1',
    })
    expect(result.status).toBe('invalid')
    expect(result.errorReason).toContain('host roof-segment')
  })

  it('derives roofSegmentId from the host gutter (ignores the call value)', () => {
    makeSegment('rseg_1')
    makeGutter('gutter_1', { roofSegmentId: 'rseg_1' })
    const result = call({
      kind: 'downspout',
      roofSegmentId: 'rseg_other',
      position: [0, 0, 0],
      gutterId: 'gutter_1',
    })
    expect(result.status).toBe('valid')
    expect(result.roofSegmentId).toBe('rseg_1')
    expect(result.gutterId).toBe('gutter_1')
  })

  it('auto-computes drop length = eaveY − gutter size (manual tool formula)', () => {
    const seg = makeSegment('rseg_1', { wallHeight: 2.5, overhang: 0.3, pitch: 40 })
    makeGutter('gutter_1', { size: 0.13 })
    const result = call({
      kind: 'downspout',
      roofSegmentId: 'rseg_1',
      position: [0, 0, 0],
      gutterId: 'gutter_1',
    })
    expect(result.status).toBe('valid')
    expect(result.length).toBeCloseTo(Math.max(0.1, computeGutterEaveY(seg) - 0.13))
  })

  it('honors an explicit length override and clamps outletOffset default to 0', () => {
    makeSegment('rseg_1')
    makeGutter('gutter_1')
    const dflt = call({
      kind: 'downspout',
      roofSegmentId: 'rseg_1',
      position: [0, 0, 0],
      gutterId: 'gutter_1',
    })
    expect(dflt.outletOffset).toBe(0)
    const explicit = call({
      kind: 'downspout',
      roofSegmentId: 'rseg_1',
      position: [0, 0, 0],
      gutterId: 'gutter_1',
      length: 4.2,
      offsetAlongGutter: -0.6,
    })
    expect(explicit.length).toBeCloseTo(4.2)
    expect(explicit.outletOffset).toBeCloseTo(-0.6)
  })
})
