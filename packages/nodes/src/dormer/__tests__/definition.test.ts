import { describe, expect, test } from 'bun:test'
import { DormerNode } from '../schema'
import { dormerDefinition } from '../definition'

describe('dormerDefinition — registry contract', () => {
  test('declares dormer kind, schemaVersion 1, structure category, roof surfaceRole', () => {
    expect(dormerDefinition.kind).toBe('dormer')
    expect(dormerDefinition.schemaVersion).toBe(1)
    expect(dormerDefinition.category).toBe('structure')
    expect(dormerDefinition.surfaceRole).toBe('roof')
  })

  test('paint capability is declared (per-surface routing through dispatcher)', () => {
    // Source comment: "Paint dispatch for the wall / side / top surface
    // split. The editor's selection-manager routes paint hover / click /
    // preview through this entry rather than carrying a kind-name arm."
    expect(dormerDefinition.capabilities.paint).toBeDefined()
  })
})

describe('dormerDefinition.capabilities.roofAccessory.buildCut', () => {
  test('buildCut returns a non-null BufferGeometry for the default dormer', () => {
    const node = DormerNode.parse({ width: 1.2, depth: 1.5, height: 1, roofHeight: 0.6 })
    const geom = dormerDefinition.capabilities.roofAccessory?.buildCut?.(
      node as any,
      // Pass any host — dormer ignores it (see contract test below).
      {} as any,
    )
    expect(geom).toBeDefined()
    // The cut is segment-local geometry the merge loop subtracts from the
    // host roof's shin / deck / wall.
    expect(geom).not.toBeNull()
  })

  test('buildCut signature accepts but IGNORES hostSegment (unlike skylight which uses it)', () => {
    // Source: `buildCut: (node, _hostSegment) => buildDormerRoofCut(node as DormerNodeType)`.
    // The underscored param is forwarded NOWHERE; dormer geometry is purely
    // self-derived from its own width/depth/roofHeight.
    const node = DormerNode.parse({ width: 1.2, depth: 1.5 })
    const callA = dormerDefinition.capabilities.roofAccessory?.buildCut?.(
      node as any,
      { id: 'segA' } as any,
    )
    const callB = dormerDefinition.capabilities.roofAccessory?.buildCut?.(
      node as any,
      { id: 'segB', wallHeight: 99, width: 999, depth: 999 } as any,
    )
    // Same vertex count / attribute layout regardless of the host arg.
    const aPos = (callA as any)?.attributes?.position?.count ?? 0
    const bPos = (callB as any)?.attributes?.position?.count ?? 0
    expect(aPos).toBe(bPos)
    expect(aPos).toBeGreaterThan(0)
  })
})

describe('dormerDefinition.capabilities — standard surface contract', () => {
  test('selectable + duplicable + deletable', () => {
    expect(dormerDefinition.capabilities.selectable?.hitVolume).toBe('bbox')
    expect(dormerDefinition.capabilities.duplicable).toBe(true)
    expect(dormerDefinition.capabilities.deletable).toBe(true)
  })

  test('movable is OMITTED — bespoke placement-ghost move-tool keeps owning move', () => {
    expect(dormerDefinition.capabilities.movable).toBeUndefined()
  })
})

describe('dormerDefinition — placement tool wiring', () => {
  test('tool + affordanceTools.move both declared', () => {
    expect(dormerDefinition.tool).toBeDefined()
    expect(dormerDefinition.affordanceTools?.move).toBeDefined()
  })

  test('toolHints include the place + rotate + cancel keys', () => {
    const hints = dormerDefinition.toolHints ?? []
    const keys = hints.map((h: any) => h.key)
    expect(keys).toContain('Left click')
    expect(keys).toContain('R / Shift+R')
    expect(keys).toContain('Esc')
  })
})

describe('dormerDefinition.presentation', () => {
  test('dormer palette metadata is stable', () => {
    expect(dormerDefinition.presentation?.label).toBe('Dormer')
    expect(dormerDefinition.presentation?.paletteSection).toBe('structure')
    expect(dormerDefinition.presentation?.paletteOrder).toBe(125)
  })
})
