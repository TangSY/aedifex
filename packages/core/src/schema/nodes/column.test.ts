import { describe, expect, test } from 'bun:test'
import { COLUMN_PRESETS, ColumnNode } from './column'

function makeColumn(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'column_abc',
    type: 'column',
    parentId: null,
    ...overrides,
  }
}

describe('ColumnNode — pinned default values', () => {
  test('style defaults to "plain", crossSection defaults to "round"', () => {
    const r = ColumnNode.parse(makeColumn())
    expect(r.style).toBe('plain')
    expect(r.crossSection).toBe('round')
  })

  test('primary dimensions: height 2.5m, radius 0.22m, width/depth 0.44m', () => {
    const r = ColumnNode.parse(makeColumn())
    expect(r.height).toBe(2.5)
    expect(r.radius).toBe(0.22)
    expect(r.width).toBe(0.44)
    expect(r.depth).toBe(0.44)
  })

  test('shaftProfile defaults to "straight", shaftDetail defaults to "none"', () => {
    const r = ColumnNode.parse(makeColumn())
    expect(r.shaftProfile).toBe('straight')
    expect(r.shaftDetail).toBe('none')
  })

  test('baseStyle defaults to "round-rings", capitalStyle defaults to "simple"', () => {
    const r = ColumnNode.parse(makeColumn())
    expect(r.baseStyle).toBe('round-rings')
    expect(r.capitalStyle).toBe('simple')
  })

  test('supportStyle defaults to "vertical"', () => {
    const r = ColumnNode.parse(makeColumn())
    expect(r.supportStyle).toBe('vertical')
  })

  test('ringPlacement defaults to "ends"', () => {
    const r = ColumnNode.parse(makeColumn())
    expect(r.ringPlacement).toBe('ends')
  })

  test('rotation defaults to 0 (number, NOT a tuple)', () => {
    const r = ColumnNode.parse(makeColumn())
    expect(r.rotation).toBe(0)
  })

  test('edgeSoftness defaults to 0.025, baseHeight and capitalHeight default to 0.18', () => {
    const r = ColumnNode.parse(makeColumn())
    expect(r.edgeSoftness).toBe(0.025)
    expect(r.baseHeight).toBe(0.18)
    expect(r.capitalHeight).toBe(0.18)
  })
})

describe('ColumnNode — bounds enforcement', () => {
  test('height must be positive', () => {
    expect(ColumnNode.safeParse(makeColumn({ height: 0 })).success).toBe(false)
    expect(ColumnNode.safeParse(makeColumn({ height: -1 })).success).toBe(false)
    expect(ColumnNode.safeParse(makeColumn({ height: 0.01 })).success).toBe(true)
  })

  test('edgeSoftness in [0, 0.12]', () => {
    expect(ColumnNode.safeParse(makeColumn({ edgeSoftness: 0 })).success).toBe(true)
    expect(ColumnNode.safeParse(makeColumn({ edgeSoftness: 0.12 })).success).toBe(true)
    expect(ColumnNode.safeParse(makeColumn({ edgeSoftness: 0.13 })).success).toBe(false)
    expect(ColumnNode.safeParse(makeColumn({ edgeSoftness: -0.01 })).success).toBe(false)
  })

  test('shaftSegmentCount: integer in [1, 64]', () => {
    expect(ColumnNode.safeParse(makeColumn({ shaftSegmentCount: 1 })).success).toBe(true)
    expect(ColumnNode.safeParse(makeColumn({ shaftSegmentCount: 64 })).success).toBe(true)
    expect(ColumnNode.safeParse(makeColumn({ shaftSegmentCount: 65 })).success).toBe(false)
    expect(ColumnNode.safeParse(makeColumn({ shaftSegmentCount: 0 })).success).toBe(false)
    expect(ColumnNode.safeParse(makeColumn({ shaftSegmentCount: 1.5 })).success).toBe(false)
  })

  test('shaftTwistStep range [-90, 90]', () => {
    expect(ColumnNode.safeParse(makeColumn({ shaftTwistStep: -90 })).success).toBe(true)
    expect(ColumnNode.safeParse(makeColumn({ shaftTwistStep: 90 })).success).toBe(true)
    expect(ColumnNode.safeParse(makeColumn({ shaftTwistStep: 91 })).success).toBe(false)
    expect(ColumnNode.safeParse(makeColumn({ shaftTwistStep: -91 })).success).toBe(false)
  })

  test('carvingPlacement defaults to "capital"', () => {
    const r = ColumnNode.parse(makeColumn())
    expect(r.carvingPlacement).toBe('capital')
  })
})

describe('COLUMN_PRESETS — drift guard', () => {
  test('basicPillar preset exists with label', () => {
    expect(COLUMN_PRESETS.basicPillar).toBeDefined()
    expect(COLUMN_PRESETS.basicPillar.label).toBe('Straight Round')
  })

  test('All preset entries have a label string', () => {
    for (const [key, preset] of Object.entries(COLUMN_PRESETS)) {
      expect(typeof preset.label).toBe('string')
      expect(preset.label.length).toBeGreaterThan(0)
      // Sanity: key should be camelCase identifier
      expect(/^[a-zA-Z]+$/.test(key)).toBe(true)
    }
  })

  test('Support presets carry supportStyle field (a-frame, y-frame, etc.)', () => {
    expect(COLUMN_PRESETS.aFrameSupport.supportStyle).toBe('a-frame')
    expect(COLUMN_PRESETS.yFrameSupport.supportStyle).toBe('y-frame')
    expect(COLUMN_PRESETS.vFrameSupport.supportStyle).toBe('v-frame')
    expect(COLUMN_PRESETS.xBraceSupport.supportStyle).toBe('x-brace')
  })
})
