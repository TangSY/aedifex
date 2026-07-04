import { describe, expect, test } from 'bun:test'
import { itemDefinition } from '../definition'

describe('itemDefinition — registry contract', () => {
  test('declares item kind, schemaVersion 1, furnish category, furnishing surfaceRole', () => {
    expect(itemDefinition.kind).toBe('item')
    expect(itemDefinition.schemaVersion).toBe(1)
    expect(itemDefinition.category).toBe('furnish')
    expect(itemDefinition.surfaceRole).toBe('furnishing')
  })

  test('renderer + system + tool + affordanceTools.move all declared', () => {
    // Item is the canonical example of `def.renderer` escape hatch (GLB
    // via useGLTF) — see wiki/architecture/node-definitions.md.
    expect(itemDefinition.renderer).toBeDefined()
    expect(itemDefinition.system).toBeDefined()
    expect(itemDefinition.tool).toBeDefined()
    expect(itemDefinition.affordanceTools?.move).toBeDefined()
  })
})

describe('itemDefinition.capabilities — host-ref contract (pin reality)', () => {
  test('hostRefFields covers wall (wallId, wallT) AND roof-surface (roofSegmentId, roofFace) host refs', () => {
    // SOURCE TRUTH: hostRefFields includes wall + roof bindings. Items
    // hosted on walls store both the wallId AND the parametric `wallT`
    // (position along the wall span). Upstream PR #438 added roof-surface
    // placement (solar panels on slopes), so `roofSegmentId` + `roofFace`
    // join the list. Host apps strip all four via `getHostRefFields(def)`
    // so the descendant re-attaches against the new wall/roof geometry
    // at preset placement time.
    expect(itemDefinition.capabilities.hostRefFields).toEqual(['wallId', 'wallT', 'roofSegmentId', 'roofFace'])
  })

  test('selectable + duplicable + deletable; no movable (bespoke MoveItemContent)', () => {
    expect(itemDefinition.capabilities.selectable?.hitVolume).toBe('bbox')
    expect(itemDefinition.capabilities.duplicable).toBe(true)
    expect(itemDefinition.capabilities.deletable).toBe(true)
    // Source comment: "item's move is bespoke `MoveItemContent` — handles
    // attachTo transitions mid-drag (floor ↔ wall ↔ ceiling) ... The smooth
    // generic mover can't express that."
    expect(itemDefinition.capabilities.movable).toBeUndefined()
  })
})

describe('itemDefinition.capabilities.floorPlaced — applies gate', () => {
  test('applies returns TRUE for floor items (no asset.attachTo)', () => {
    // Floor items participate in the FloorElevationSystem (lifted by raised
    // slabs); wall- / ceiling-attached items skip the lift.
    const floorItem: any = { asset: {} }
    expect(itemDefinition.capabilities.floorPlaced?.applies?.(floorItem)).toBe(true)
  })

  test('applies returns FALSE for wall-attached items (asset.attachTo === "wall")', () => {
    const wallItem: any = { asset: { attachTo: 'wall' } }
    expect(itemDefinition.capabilities.floorPlaced?.applies?.(wallItem)).toBe(false)
  })

  test('applies returns FALSE for ceiling-attached items', () => {
    const ceilingItem: any = { asset: { attachTo: 'ceiling' } }
    expect(itemDefinition.capabilities.floorPlaced?.applies?.(ceilingItem)).toBe(false)
  })

  test('footprint returns scaled dimensions + asset rotation tuple', () => {
    // getScaledDimensions multiplies the asset.dimensions by node.scale.
    const item: any = {
      asset: { dimensions: [2, 1, 0.5] },
      scale: [1, 1, 1],
      rotation: [0, Math.PI / 2, 0],
    }
    const footprint = itemDefinition.capabilities.floorPlaced?.footprint?.(item) as any
    expect(footprint.dimensions).toEqual([2, 1, 0.5])
    expect(footprint.rotation).toEqual([0, Math.PI / 2, 0])
  })
})

describe('itemDefinition — floorplan integration', () => {
  test('floorplan + floorplanMoveTarget both declared (Path 1 in registry overlay)', () => {
    // floorplanMoveTarget is critical to avoid the Path 2 "stomp SVG
    // transform attribute" bug noted in shelf definition.
    expect(itemDefinition.floorplan).toBeDefined()
    expect(itemDefinition.floorplanMoveTarget).toBeDefined()
  })
})

describe('itemDefinition.toolHints', () => {
  test('placement tool hints expose R / T, Shift, Alt, Esc', () => {
    // Upstream merged R + T into a single 'R / T' rotate hint and added Alt
    // (force place). Verify all functional keys still surface.
    const hints = itemDefinition.toolHints ?? []
    const keys = hints.map((h: any) => h.key)
    expect(keys).toContain('R / T')
    expect(keys).toContain('Shift')
    expect(keys).toContain('Alt')
    expect(keys).toContain('Esc')
  })
})

describe('itemDefinition.presentation', () => {
  test('item palette metadata is stable', () => {
    expect(itemDefinition.presentation?.label).toBe('Item')
    expect(itemDefinition.presentation?.paletteSection).toBe('furnish')
    expect(itemDefinition.presentation?.paletteOrder).toBe(10)
  })
})
