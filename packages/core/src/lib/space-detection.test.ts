import { describe, expect, test } from 'bun:test'
import { SlabNode } from '../schema'
import { planAutoCeilingsForLevel, planAutoSlabsForLevel } from './space-detection'

// Auto-slab sync planner: given detected room polygons (Point2D[][]) and the
// existing SlabNode set, output {create, update, delete} so the scene stays
// in sync with the closed-wall topology without churning auto-slab ids.

// Helper to build a manual (user-drawn) slab — autoFromWalls=false
function makeManualSlab(polygon: [number, number][], id?: string, elevation = 0.05): SlabNode {
  return SlabNode.parse({
    ...(id ? { id } : {}),
    polygon,
    holes: [],
    elevation,
    autoFromWalls: false,
  })
}

// Helper to build an auto slab with a stable id — autoFromWalls=true
function makeAutoSlab(polygon: [number, number][], id?: string): SlabNode {
  return SlabNode.parse({
    ...(id ? { id } : {}),
    polygon,
    holes: [],
    elevation: 0.05,
    autoFromWalls: true,
  })
}

const SQUARE_A: [number, number][] = [
  [0, 0],
  [4, 0],
  [4, 4],
  [0, 4],
]

const SQUARE_B: [number, number][] = [
  [10, 10],
  [14, 10],
  [14, 14],
  [10, 14],
]

function toPoint2D(poly: [number, number][]) {
  return poly.map(([x, y]) => ({ x, y }))
}

describe('planAutoSlabsForLevel - no existing slabs', () => {
  test('creates one auto-slab per detected room', () => {
    const plan = planAutoSlabsForLevel([toPoint2D(SQUARE_A), toPoint2D(SQUARE_B)], [])
    expect(plan.create.length).toBe(2)
    expect(plan.update).toEqual([])
    expect(plan.delete).toEqual([])
    for (const slab of plan.create) {
      expect(slab.autoFromWalls).toBe(true)
      expect(slab.elevation).toBeCloseTo(0.05, 6)
    }
  })

  test('auto-naming uses next "Room N Slab" sequence', () => {
    const plan = planAutoSlabsForLevel(
      [toPoint2D(SQUARE_A), toPoint2D(SQUARE_B)],
      [],
    )
    const names = plan.create.map((s) => s.name).sort()
    expect(names).toEqual(['Room 1 Slab', 'Room 2 Slab'])
  })

  test('no detected rooms + no existing slabs: empty plan', () => {
    const plan = planAutoSlabsForLevel([], [])
    expect(plan.create).toEqual([])
    expect(plan.update).toEqual([])
    expect(plan.delete).toEqual([])
  })
})

describe('planAutoSlabsForLevel - signature-stable reuse', () => {
  test('detected polygon matches existing auto-slab by polygonSignature → update, not create+delete', () => {
    const existing = makeAutoSlab(SQUARE_A, 'slab_test_existing_a')
    const plan = planAutoSlabsForLevel([toPoint2D(SQUARE_A)], [existing])

    // Polygon is bit-identical → sameTuplePolygon returns true → no update row either
    expect(plan.create).toEqual([])
    expect(plan.delete).toEqual([])
    expect(plan.update).toEqual([])
  })

  test('rotation/translation of the same polygon: same signature still matches existing slab', () => {
    // Same square shape, vertices rotated in the array — same polygonSignature
    const existing = makeAutoSlab(SQUARE_A, 'slab_test_rotated_match')
    const rotated: [number, number][] = [
      [4, 0],
      [4, 4],
      [0, 4],
      [0, 0],
    ]
    const plan = planAutoSlabsForLevel([toPoint2D(rotated)], [existing])
    expect(plan.create.length).toBe(0)
    expect(plan.delete.length).toBe(0)
    // May or may not produce update row depending on tuple-equality after simplify;
    // critical guarantee: no churn (existing id preserved as candidate, not deleted)
  })
})

describe('planAutoSlabsForLevel - manual slabs are untouchable', () => {
  test('manual slab whose polygon matches a detected room is preserved AND no auto slab created for the matching room', () => {
    const manual = makeManualSlab(SQUARE_A, 'slab_test_manual_keep')
    const plan = planAutoSlabsForLevel([toPoint2D(SQUARE_A), toPoint2D(SQUARE_B)], [manual])

    // Manual slab not in delete/update; one new auto-slab for SQUARE_B only
    expect(plan.delete).not.toContain('slab_test_manual_keep')
    expect(plan.update.every((u) => u.id !== 'slab_test_manual_keep')).toBe(true)
    expect(plan.create.length).toBe(1)
  })

  test('manual slab matching only detected room: no auto-slabs created at all', () => {
    const manual = makeManualSlab(SQUARE_A, 'slab_test_only_manual')
    const plan = planAutoSlabsForLevel([toPoint2D(SQUARE_A)], [manual])
    expect(plan.create).toEqual([])
    expect(plan.delete).toEqual([])
    expect(plan.update).toEqual([])
  })
})

describe('planAutoSlabsForLevel - stale auto-slabs', () => {
  test('auto-slab whose room no longer exists is queued for delete', () => {
    const stale = makeAutoSlab(SQUARE_A, 'slab_test_stale_one')
    const plan = planAutoSlabsForLevel([toPoint2D(SQUARE_B)], [stale])

    expect(plan.delete).toContain('slab_test_stale_one')
    // One new auto-slab for SQUARE_B
    expect(plan.create.length).toBe(1)
  })

  test('best-match by centroid+area reuses stale slab id for nearby new room (no churn)', () => {
    // Existing slab roughly where the new room is — within 1.5m centroid distance
    const slightlyShifted: [number, number][] = [
      [0.1, 0.1],
      [4.1, 0.1],
      [4.1, 4.1],
      [0.1, 4.1],
    ]
    const existing = makeAutoSlab(slightlyShifted, 'slab_test_shift_reuse')
    const plan = planAutoSlabsForLevel([toPoint2D(SQUARE_A)], [existing])

    expect(plan.delete).toEqual([])
    expect(plan.create.length).toBe(0)
    // Update may or may not be emitted depending on tuple equality of polygons
  })
})

describe('planAutoCeilingsForLevel - parallels slab planner', () => {
  test('creates one ceiling per room when none exist', () => {
    const plan = planAutoCeilingsForLevel([toPoint2D(SQUARE_A)], [])
    expect(plan.create.length).toBe(1)
    expect(plan.create[0]?.autoFromWalls).toBe(true)
    expect(plan.create[0]?.height).toBeCloseTo(2.5, 6)
  })

  test('default height for new auto-ceilings is 2.5m', () => {
    const plan = planAutoCeilingsForLevel([toPoint2D(SQUARE_A), toPoint2D(SQUARE_B)], [])
    for (const ceiling of plan.create) {
      expect(ceiling.height).toBeCloseTo(2.5, 6)
    }
  })
})
