import { describe, expect, test } from 'bun:test'
import { chimneyDefinition } from '../definition'

describe('chimneyDefinition — registry contract', () => {
  test('declares chimney kind, schemaVersion 1, structure category, wall surfaceRole', () => {
    expect(chimneyDefinition.kind).toBe('chimney')
    expect(chimneyDefinition.schemaVersion).toBe(1)
    expect(chimneyDefinition.category).toBe('structure')
    expect(chimneyDefinition.surfaceRole).toBe('wall')
  })

  test('parametrics + renderer + tool + paint capability declared', () => {
    expect(chimneyDefinition.parametrics).toBeDefined()
    expect(chimneyDefinition.renderer).toBeDefined()
    expect(chimneyDefinition.tool).toBeDefined()
    expect(chimneyDefinition.capabilities.paint).toBeDefined()
  })
})

describe('chimneyDefinition.capabilities — roofAccessory contract', () => {
  test('roofAccessory is declared as an EMPTY object (no buildCut — chimney self-trims)', () => {
    // CRITICAL: chimney is the only roof accessory whose roofAccessory has
    // no `buildCut`. Source comment:
    //   "No `buildCut` — the chimney does its own self-trim via
    //    `trimChimneyBodyAgainstRoof`; the host roof shell stays solid
    //    underneath."
    // The roof's merged shell does NOT subtract a chimney brush.
    expect(chimneyDefinition.capabilities.roofAccessory).toBeDefined()
    expect(chimneyDefinition.capabilities.roofAccessory?.buildCut).toBeUndefined()
  })

  test('selectable + duplicable + deletable', () => {
    expect(chimneyDefinition.capabilities.selectable?.hitVolume).toBe('bbox')
    expect(chimneyDefinition.capabilities.duplicable).toBe(true)
    expect(chimneyDefinition.capabilities.deletable).toBe(true)
  })

  test('movable is OMITTED — bespoke placement-ghost move-tool keeps owning move', () => {
    expect(chimneyDefinition.capabilities.movable).toBeUndefined()
  })
})

describe('chimneyDefinition — placement tool wiring', () => {
  test('tool + affordanceTools.move both declared', () => {
    expect(chimneyDefinition.tool).toBeDefined()
    expect(chimneyDefinition.affordanceTools?.move).toBeDefined()
  })

  test('toolHints expose the place + cancel keys', () => {
    const hints = chimneyDefinition.toolHints ?? []
    const keys = hints.map((h: any) => h.key)
    expect(keys).toContain('Left click')
    expect(keys).toContain('Esc')
  })
})

describe('chimneyDefinition.defaults — white-on-white starting paint', () => {
  test('defaults seed material + topMaterial with color #ffffff', () => {
    // Source comment: "Every fresh chimney starts as plain white (body +
    // top). The paint flow / material picker writes preset refs or full
    // MaterialSchema objects on top of this."
    const d = chimneyDefinition.defaults() as any
    expect(d.material?.properties?.color).toBe('#ffffff')
    expect(d.topMaterial?.properties?.color).toBe('#ffffff')
  })
})

describe('chimneyDefinition.presentation', () => {
  test('chimney palette metadata is stable', () => {
    expect(chimneyDefinition.presentation?.label).toBe('Chimney')
    expect(chimneyDefinition.presentation?.paletteSection).toBe('structure')
    expect(chimneyDefinition.presentation?.paletteOrder).toBe(122)
  })
})
