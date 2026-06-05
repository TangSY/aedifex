import { describe, expect, test } from 'bun:test'
import { zoneDefinition } from '../definition'

describe('zoneDefinition — registry contract', () => {
  test('declares zone kind, schemaVersion 1, site category', () => {
    expect(zoneDefinition.kind).toBe('zone')
    expect(zoneDefinition.schemaVersion).toBe(1)
    expect(zoneDefinition.category).toBe('site')
    // Note: zone does NOT declare a `surfaceRole` (unlike most kinds) —
    // it's a polygon-bound region, not a paintable surface.
    expect(zoneDefinition.surfaceRole).toBeUndefined()
  })

  test('renderer + system declared — custom-behavior escape hatch', () => {
    // Source comment: "Custom-behavior escape hatch: zone uses TSL shader
    // materials + <Html> portals + per-frame uniform poking, so it lives
    // via def.renderer + def.system (no def.geometry possible because zone
    // isn't really a mesh)."
    expect(zoneDefinition.renderer).toBeDefined()
    expect(zoneDefinition.system).toBeDefined()
    expect(zoneDefinition.geometry).toBeUndefined()
  })
})

describe('zoneDefinition.capabilities', () => {
  test('selectable + duplicable + deletable', () => {
    expect(zoneDefinition.capabilities.selectable?.hitVolume).toBe('bbox')
    expect(zoneDefinition.capabilities.duplicable).toBe(true)
    expect(zoneDefinition.capabilities.deletable).toBe(true)
  })

  test('presettable === false — zones are site-bound, not portable presets', () => {
    // Source comment: "Zones describe regions of a site — they don't
    // translate as reusable presets independent of their site context."
    // Distinguishes zone from most other kinds where presettable defaults
    // to true via the parametrics-declared rule.
    expect(zoneDefinition.capabilities.presettable).toBe(false)
  })

  test('movable is OMITTED — zone move is driven by polygon-vertex edits', () => {
    expect(zoneDefinition.capabilities.movable).toBeUndefined()
  })
})

describe('zoneDefinition.floorplanAffordances — polygon editor', () => {
  test('exposes move-vertex + add-vertex + move-edge (same set slabs / ceilings expose)', () => {
    // Source comment: "Polygon editor when selected — same three
    // operations slabs / ceilings expose. The shared factories key off
    // node.polygon, optional node.holes (absent on zones)."
    const aff = zoneDefinition.floorplanAffordances
    expect(aff?.['move-vertex']).toBeDefined()
    expect(aff?.['add-vertex']).toBeDefined()
    expect(aff?.['move-edge']).toBeDefined()
  })
})

describe('zoneDefinition.floorplan', () => {
  test('floorplan builder declared (zone renders as polygon in plan view)', () => {
    expect(zoneDefinition.floorplan).toBeDefined()
  })
})

describe('zoneDefinition.presentation', () => {
  test('zone palette metadata is stable', () => {
    expect(zoneDefinition.presentation?.label).toBe('Zone')
    expect(zoneDefinition.presentation?.paletteSection).toBe('site')
    expect(zoneDefinition.presentation?.paletteOrder).toBe(20)
  })
})
