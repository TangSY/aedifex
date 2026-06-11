import { describe, expect, test } from 'bun:test'
import { shelfDefinition } from '../definition'
import { ShelfNode } from '../schema'
import { shelfRowSurfaceYs } from '../geometry'

describe('shelfDefinition — registry contract', () => {
  test('declares shelf kind, schemaVersion 2, furnish category, joinery surfaceRole', () => {
    expect(shelfDefinition.kind).toBe('shelf')
    // Note: schemaVersion is 2 (NOT 1) — bumped at some point post-A.
    expect(shelfDefinition.schemaVersion).toBe(2)
    expect(shelfDefinition.category).toBe('furnish')
    expect(shelfDefinition.surfaceRole).toBe('joinery')
  })

  test('geometry + floorplan + parametrics all declared (three-checkbox shape)', () => {
    expect(shelfDefinition.geometry).toBeDefined()
    expect(shelfDefinition.floorplan).toBeDefined()
    expect(shelfDefinition.parametrics).toBeDefined()
  })
})

describe('shelfDefinition.capabilities', () => {
  test('movable + rotatable declared (generic Y-rotate snap angles)', () => {
    // Shelf USES the generic movable cap (unlike column / item / wall).
    expect(shelfDefinition.capabilities.movable).toBeDefined()
    expect(shelfDefinition.capabilities.movable?.axes).toEqual(['x', 'z'])
    expect(shelfDefinition.capabilities.movable?.gridSnap).toBe(true)
    expect(shelfDefinition.capabilities.rotatable?.axes).toEqual(['y'])
    expect(shelfDefinition.capabilities.rotatable?.snapAngles).toHaveLength(5)
  })

  test('selectable + duplicable + deletable + floorPlaced.footprint', () => {
    expect(shelfDefinition.capabilities.selectable?.hitVolume).toBe('bbox')
    expect(shelfDefinition.capabilities.duplicable).toBe(true)
    expect(shelfDefinition.capabilities.deletable).toBe(true)
    const node = ShelfNode.parse({ width: 1, height: 1.8, depth: 0.5 })
    const fp = shelfDefinition.capabilities.floorPlaced?.footprint?.(node as any) as any
    expect(fp.dimensions).toEqual([1, 1.8, 0.5])
  })
})

describe('shelfDefinition.capabilities.surfaces — multi-row hosting', () => {
  test('surfaces.custom returns one SurfacePoint per row from shelfRowSurfaceYs', () => {
    // Multi-row hosting contract: each row board exposes a surface so items
    // can stack on whichever row the cursor targets. The placement
    // coordinator's shelf strategy picks the closest by cursor local-Y.
    const node = ShelfNode.parse({ rows: 3, withBottom: true, style: 'cubby' })
    const expected = shelfRowSurfaceYs(node)
    const custom = (shelfDefinition.capabilities.surfaces?.custom as any)(node)
    expect(custom).toHaveLength(expected.length)
    // Each point centered on (0, rowY, 0) with up normal.
    custom.forEach((pt: any, i: number) => {
      expect(pt.position[0]).toBe(0)
      expect(pt.position[1]).toBeCloseTo(expected[i]!)
      expect(pt.position[2]).toBe(0)
      expect(pt.normal).toEqual([0, 1, 0])
    })
  })

  test('surfaces.top.height returns the topmost row Y (last entry of shelfRowSurfaceYs)', () => {
    // Legacy-compat surface: code that assumed a single shelf surface still
    // resolves to the topmost board.
    const node = ShelfNode.parse({ rows: 4 })
    const expected = shelfRowSurfaceYs(node).at(-1)
    const topHeight = (shelfDefinition.capabilities.surfaces?.top?.height as any)(node)
    expect(topHeight).toBeCloseTo(expected!)
  })

  test('surfaces.custom row count tracks `rows` field', () => {
    const single = ShelfNode.parse({ rows: 1, style: 'cubby', withBottom: false })
    const triple = ShelfNode.parse({ rows: 3, style: 'cubby', withBottom: false })
    const singleSurfaces = (shelfDefinition.capabilities.surfaces?.custom as any)(single)
    const tripleSurfaces = (shelfDefinition.capabilities.surfaces?.custom as any)(triple)
    expect(singleSurfaces.length).toBe(1)
    expect(tripleSurfaces.length).toBe(3)
  })
})

describe('shelfDefinition.relations', () => {
  test('hosts ["item"] + cascadeDelete descendants', () => {
    expect(shelfDefinition.relations?.hosts).toContain('item')
    expect(shelfDefinition.relations?.cascadeDelete).toBe('descendants')
  })
})

describe('shelfDefinition.handles', () => {
  test('returns five handles (width, depth, height, rotate, move) — shape-invariant', () => {
    const handles = (shelfDefinition.handles as (n: any) => any[])(ShelfNode.parse({}))
    expect(handles).toHaveLength(5)
    expect(handles[0].axis).toBe('x') // width
    expect(handles[1].axis).toBe('z') // depth
    expect(handles[2].axis).toBe('y') // height
    expect(handles[3].kind).toBe('arc-resize') // rotate
    expect(handles[4].kind).toBe('translate') // move grip (upstream #375)
  })

  test('rotate handle writes back a [x, y, z] tuple with Y mutated (not a scalar)', () => {
    // Source: shelf stores rotation as `[x, y, z]` tuple — the apply patch
    // writes back the whole tuple. Distinguishes shelf from column /
    // roof-segment which store rotation as a scalar.
    const handles = (shelfDefinition.handles as (n: any) => any[])(ShelfNode.parse({}))
    const rotate = handles[3]
    const patch = rotate.apply({ rotation: [0.1, 1.0, 0.2] } as any, 0.3)
    expect(Array.isArray(patch.rotation)).toBe(true)
    expect(patch.rotation[0]).toBe(0.1)
    expect(patch.rotation[1]).toBeCloseTo(0.7)
    expect(patch.rotation[2]).toBe(0.2)
  })
})

describe('shelfDefinition.floorplanAffordances + floorplanMoveTarget', () => {
  test('shelf-resize + shelf-rotate affordances declared', () => {
    expect(shelfDefinition.floorplanAffordances?.['shelf-resize']).toBeDefined()
    expect(shelfDefinition.floorplanAffordances?.['shelf-rotate']).toBeDefined()
  })

  test('floorplanMoveTarget set — Path 1 in FloorplanRegistryMoveOverlay', () => {
    // Source comment: "Without this the overlay falls through to Path 2
    // which stomps the SVG entry's `transform` attribute ... producing the
    // 'ultra slow, wrong place' symptom the user observed."
    expect(shelfDefinition.floorplanMoveTarget).toBeDefined()
  })
})

describe('shelfDefinition.presentation', () => {
  test('shelf palette metadata is stable', () => {
    expect(shelfDefinition.presentation?.label).toBe('Shelf')
    expect(shelfDefinition.presentation?.paletteSection).toBe('furnish')
    expect(shelfDefinition.presentation?.paletteOrder).toBe(30)
  })
})
