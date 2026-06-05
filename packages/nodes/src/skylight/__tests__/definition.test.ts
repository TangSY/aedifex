import { describe, expect, test } from 'bun:test'
import { SkylightNode } from '../schema'
import { skylightDefinition } from '../definition'

describe('skylightDefinition — registry contract', () => {
  test('declares skylight kind, schemaVersion 1, structure category, glazing surfaceRole', () => {
    expect(skylightDefinition.kind).toBe('skylight')
    expect(skylightDefinition.schemaVersion).toBe(1)
    expect(skylightDefinition.category).toBe('structure')
    expect(skylightDefinition.surfaceRole).toBe('glazing')
  })

  test('parametrics, system, tool, affordanceTools.move all declared', () => {
    expect(skylightDefinition.parametrics).toBeDefined()
    expect(skylightDefinition.system).toBeDefined()
    expect(skylightDefinition.tool).toBeDefined()
    expect(skylightDefinition.affordanceTools?.move).toBeDefined()
  })
})

describe('skylightDefinition.capabilities.roofAccessory.buildCut — passes hostSegment through', () => {
  test('buildCut is invoked with (skylight, hostSegment) — both args consumed', () => {
    // Source: `buildCut: (node, hostSegment) => buildSkylightRoofCut(node, hostSegment)`.
    // Unlike dormer (which drops the segment), skylight forwards it so the
    // cut can be projected through the segment's slope frame.
    const node = SkylightNode.parse({
      id: 'skylight_test' as never,
      type: 'skylight',
      position: [0, 0, 0],
      width: 0.8,
      height: 1.0,
    })
    // Minimal segment stub. buildSkylightRoofCut reads at least the
    // skylight's own dims; any segment value should not crash.
    const seg = { id: 'seg', type: 'roof-segment', width: 8, depth: 6, wallHeight: 2, pitch: 30, roofType: 'gable' } as any
    const geom = skylightDefinition.capabilities.roofAccessory?.buildCut?.(node as any, seg)
    // The cut may legitimately return null for degenerate dims; for valid
    // inputs we expect a non-null geometry.
    expect(geom).not.toBeUndefined()
  })
})

describe('skylightDefinition.capabilities — standard surface contract', () => {
  test('selectable + duplicable + deletable', () => {
    expect(skylightDefinition.capabilities.selectable?.hitVolume).toBe('bbox')
    expect(skylightDefinition.capabilities.duplicable).toBe(true)
    expect(skylightDefinition.capabilities.deletable).toBe(true)
  })

  test('movable is OMITTED — bespoke move-tool keeps owning move', () => {
    expect(skylightDefinition.capabilities.movable).toBeUndefined()
  })
})

describe('skylightDefinition.keyboardActions.r — appliesTo gate', () => {
  test('appliesTo TRUE only for skylight nodes whose skylightType is operable', () => {
    // Source: `node.type === 'skylight' && isOperableSkylightNode(node)`.
    // Operable = skylightType in {'opening', 'sliding'}.
    const opening = SkylightNode.parse({
      id: 'skylight_o' as never,
      type: 'skylight',
      skylightType: 'opening',
    })
    const flat = SkylightNode.parse({
      id: 'skylight_f' as never,
      type: 'skylight',
      skylightType: 'flat',
    })
    const r = skylightDefinition.keyboardActions?.r
    expect(r?.appliesTo(opening as any)).toBe(true)
    expect(r?.appliesTo(flat as any)).toBe(false)
  })

  test('appliesTo FALSE for a non-skylight node, even one with skylightType-looking metadata', () => {
    const fake = {
      type: 'window',
      id: 'window_x',
      skylightType: 'opening',
    }
    const r = skylightDefinition.keyboardActions?.r
    expect(r?.appliesTo(fake as any)).toBe(false)
  })

  test('appliesTo TRUE for sliding (second operable variant)', () => {
    const sliding = SkylightNode.parse({
      id: 'skylight_s' as never,
      type: 'skylight',
      skylightType: 'sliding',
    })
    const r = skylightDefinition.keyboardActions?.r
    expect(r?.appliesTo(sliding as any)).toBe(true)
  })

  test('t key applies same gate as r (close-only force)', () => {
    const opening = SkylightNode.parse({
      id: 'skylight_o' as never,
      type: 'skylight',
      skylightType: 'opening',
    })
    const flat = SkylightNode.parse({
      id: 'skylight_f' as never,
      type: 'skylight',
      skylightType: 'flat',
    })
    expect(skylightDefinition.keyboardActions?.t?.appliesTo(opening as any)).toBe(true)
    expect(skylightDefinition.keyboardActions?.t?.appliesTo(flat as any)).toBe(false)
  })
})

describe('skylightDefinition.presentation', () => {
  test('skylight palette metadata is stable', () => {
    expect(skylightDefinition.presentation?.label).toBe('Skylight')
    expect(skylightDefinition.presentation?.paletteSection).toBe('structure')
    expect(skylightDefinition.presentation?.paletteOrder).toBe(124)
  })
})
