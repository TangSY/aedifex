import { describe, expect, test } from 'bun:test'
import { ColumnNode } from '@aedifex/core'
import { columnDefinition } from '../definition'

// `columnDefinition.handles` is a function `(node) => HandleDescriptor[]`
// because the arrow set is shape-dependent on `supportStyle` × `crossSection`:
//   - vertical + round / octagonal / sixteen-sided → 1 radius arrow
//   - vertical + square                            → 1 uniform arrow
//   - vertical + rectangular                       → 2 axis arrows
//   - non-vertical (a-frame / y-frame / x-brace …) → 2 brace arrows
//                                                    + optional spread arrows
// Height + rotate are universal. Tests evaluate the function with a parsed
// column stub varied per scenario.
function makeColumn(overrides: Record<string, unknown> = {}) {
  return ColumnNode.parse({
    id: 'column_test' as never,
    type: 'column',
    ...overrides,
  })
}

describe('columnDefinition — registry contract', () => {
  test('declares column kind, schemaVersion 1, structure category', () => {
    expect(columnDefinition.kind).toBe('column')
    expect(columnDefinition.schemaVersion).toBe(1)
    expect(columnDefinition.category).toBe('structure')
    expect(columnDefinition.surfaceRole).toBe('wall')
  })

  test('parametrics declared (presettable defaults true)', () => {
    expect(columnDefinition.parametrics).toBeDefined()
  })
})

describe('columnDefinition.capabilities', () => {
  test('selectable + duplicable + deletable', () => {
    expect(columnDefinition.capabilities.selectable).toBeDefined()
    expect(columnDefinition.capabilities.selectable?.hitVolume).toBe('bbox')
    expect(columnDefinition.capabilities.duplicable).toBe(true)
    expect(columnDefinition.capabilities.deletable).toBe(true)
  })

  test('movable is OMITTED — bespoke MoveColumnTool keeps owning move', () => {
    // Source comment: "column doesn't declare `movable` because its move is
    // bespoke (legacy MoveColumnTool snaps to slab + free placement on the
    // X/Z plane with rotation)."
    expect(columnDefinition.capabilities.movable).toBeUndefined()
  })

  test('floorPlaced.footprint returns [width, height, depth] + Y-rotation tuple', () => {
    const node = makeColumn({ width: 0.5, height: 3, depth: 0.6, rotation: Math.PI / 4 }) as any
    const footprint = columnDefinition.capabilities.floorPlaced?.footprint?.(node) as any
    expect(footprint).toBeDefined()
    expect(footprint.dimensions).toEqual([0.5, 3, 0.6])
    // Column stores rotation as a scalar but the slab-overlap query expects
    // the full Euler tuple; only the Y slot carries the value.
    expect(footprint.rotation).toEqual([0, Math.PI / 4, 0])
  })
})

describe('columnDefinition.handles — shape-dependent arrow set', () => {
  test('vertical + round → height + radius + rotate = 3 handles', () => {
    // Source: vertical branch with ROUND_CROSS_SECTIONS hits `columnRadiusHandle()`.
    const handles = (columnDefinition.handles as (n: any) => any[])(
      makeColumn({ supportStyle: 'vertical', crossSection: 'round' }),
    )
    expect(handles).toHaveLength(3)
    // [0] height (linear-resize y), [1] radius (radial-resize), [2] rotate (arc-resize rotate).
    expect(handles[0].kind).toBe('linear-resize')
    expect(handles[0].axis).toBe('y')
    expect(handles[1].kind).toBe('radial-resize')
    expect(handles[2].kind).toBe('arc-resize')
    expect(handles[2].shape).toBe('rotate')
  })

  test('vertical + octagonal / sixteen-sided also yield exactly 1 radius arrow', () => {
    for (const cs of ['octagonal', 'sixteen-sided'] as const) {
      const handles = (columnDefinition.handles as (n: any) => any[])(
        makeColumn({ supportStyle: 'vertical', crossSection: cs }),
      )
      expect(handles).toHaveLength(3)
      expect(handles[1].kind).toBe('radial-resize')
    }
  })

  test('vertical + square → uniform width=depth arrow (1 footprint arrow)', () => {
    const handles = (columnDefinition.handles as (n: any) => any[])(
      makeColumn({ supportStyle: 'vertical', crossSection: 'square' }),
    )
    expect(handles).toHaveLength(3)
    // Uniform arrow writes BOTH width and depth from the same drag.
    const uniform = handles[1]
    expect(uniform.kind).toBe('linear-resize')
    const patch = uniform.apply(makeColumn(), 0.8)
    expect(patch).toEqual({ width: 0.8, depth: 0.8 })
  })

  test('vertical + rectangular → width + depth axis arrows (2 footprint arrows)', () => {
    const handles = (columnDefinition.handles as (n: any) => any[])(
      makeColumn({ supportStyle: 'vertical', crossSection: 'rectangular' }),
    )
    // height + width + depth + rotate.
    expect(handles).toHaveLength(4)
    expect(handles[1].axis).toBe('x')
    expect(handles[2].axis).toBe('z')
  })

  test('a-frame adds bottom-spread + top-spread to brace arrows', () => {
    // STYLES_WITH_BOTTOM_SPREAD = {'a-frame'}; STYLES_WITH_TOP_SPREAD = {'a-frame', 'y-frame', 'v-frame'}.
    // So a-frame is unique in adding BOTH spread arrows.
    const handles = (columnDefinition.handles as (n: any) => any[])(
      makeColumn({ supportStyle: 'a-frame' }),
    )
    // height + braceWidth + braceDepth + bottomSpread + topSpread + rotate = 6.
    expect(handles).toHaveLength(6)
    // Confirm the brace + spread patches target the right fields.
    expect(handles[1].apply(makeColumn(), 0.2)).toEqual({ braceWidth: 0.2 })
    expect(handles[2].apply(makeColumn(), 0.2)).toEqual({ braceDepth: 0.2 })
    expect(handles[3].apply(makeColumn(), 1.3)).toEqual({ braceBottomSpread: 1.3 })
    expect(handles[4].apply(makeColumn(), 0.15)).toEqual({ braceTopSpread: 0.15 })
  })

  test('y-frame / v-frame add only top-spread (no bottom-spread)', () => {
    for (const style of ['y-frame', 'v-frame'] as const) {
      const handles = (columnDefinition.handles as (n: any) => any[])(
        makeColumn({ supportStyle: style }),
      )
      // height + braceWidth + braceDepth + topSpread + rotate = 5.
      expect(handles).toHaveLength(5)
      // No `braceBottomSpread`-emitting handle should appear.
      const fields = handles.map((h) => h.apply?.(makeColumn(), 1) ?? {}).map((p) => Object.keys(p)[0])
      expect(fields).not.toContain('braceBottomSpread')
      expect(fields).toContain('braceTopSpread')
    }
  })

  test('x-brace / k-brace / single-strut → brace width/depth + rotate (no spreads)', () => {
    for (const style of ['x-brace', 'k-brace', 'single-strut'] as const) {
      const handles = (columnDefinition.handles as (n: any) => any[])(
        makeColumn({ supportStyle: style }),
      )
      // height + braceWidth + braceDepth + rotate = 4.
      expect(handles).toHaveLength(4)
    }
  })

  test('rotation handle negates the cursor delta (cursor atan2 vs three.js Ry)', () => {
    const handles = (columnDefinition.handles as (n: any) => any[])(makeColumn())
    const rotate = handles.at(-1)
    expect(rotate.shape).toBe('rotate')
    // Source: `apply: (initial, delta) => ({ rotation: (initial.rotation ?? 0) - delta })`
    const patch = rotate.apply({ rotation: 1.0 } as any, 0.3)
    expect(patch.rotation).toBeCloseTo(0.7)
  })
})

describe('columnDefinition.floorplanAffordances', () => {
  test('exposes column-resize + column-rotate', () => {
    // Source comment: "column-resize handles every dimension arrow ... the
    // payload's `dim` field discriminates radius / uniform / width / depth /
    // brace-width / brace-depth / spreads."
    const aff = columnDefinition.floorplanAffordances
    expect(aff?.['column-resize']).toBeDefined()
    expect(aff?.['column-rotate']).toBeDefined()
  })
})

describe('columnDefinition.affordanceTools', () => {
  test('move is the only registered tool (registry-driven MoveColumnTool)', () => {
    expect(columnDefinition.affordanceTools?.move).toBeDefined()
  })
})

describe('columnDefinition.presentation', () => {
  test('column palette metadata is stable', () => {
    expect(columnDefinition.presentation?.label).toBe('Column')
    expect(columnDefinition.presentation?.paletteSection).toBe('structure')
    expect(columnDefinition.presentation?.paletteOrder).toBe(70)
  })
})
