import { describe, expect, test } from 'bun:test'
import { SolarPanelNode } from './solar-panel'

function makePanel(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'solarpanel_abc',
    type: 'solar-panel',
    parentId: null,
    ...overrides,
  }
}

describe('SolarPanelNode — pinned default values', () => {
  test('rows defaults to 2, columns defaults to 3', () => {
    const r = SolarPanelNode.parse(makePanel())
    expect(r.rows).toBe(2)
    expect(r.columns).toBe(3)
  })

  test('panel dimensions default to residential preset: 1.0m x 1.65m', () => {
    const r = SolarPanelNode.parse(makePanel())
    expect(r.panelWidth).toBe(1.0)
    expect(r.panelHeight).toBe(1.65)
  })

  test('gapX and gapY default to 0.02m (20mm)', () => {
    const r = SolarPanelNode.parse(makePanel())
    expect(r.gapX).toBe(0.02)
    expect(r.gapY).toBe(0.02)
  })

  test('mountingType defaults to "flush"', () => {
    const r = SolarPanelNode.parse(makePanel())
    expect(r.mountingType).toBe('flush')
  })

  test('tiltAngle defaults to 15 degrees', () => {
    const r = SolarPanelNode.parse(makePanel())
    expect(r.tiltAngle).toBe(15)
  })

  test('standoffHeight defaults to 0.05m', () => {
    const r = SolarPanelNode.parse(makePanel())
    expect(r.standoffHeight).toBe(0.05)
  })

  test('frameThickness and frameDepth default to 0.04m each', () => {
    const r = SolarPanelNode.parse(makePanel())
    expect(r.frameThickness).toBe(0.04)
    expect(r.frameDepth).toBe(0.04)
  })

  test('rotation defaults to 0 (number, NOT a tuple)', () => {
    const r = SolarPanelNode.parse(makePanel())
    expect(r.rotation).toBe(0)
  })

  test('position defaults to [0, 0, 0]', () => {
    const r = SolarPanelNode.parse(makePanel())
    expect(r.position).toEqual([0, 0, 0])
  })
})

describe('SolarPanelNode — bounds enforcement', () => {
  test('rows: integer in [1, 20]', () => {
    expect(SolarPanelNode.safeParse(makePanel({ rows: 1 })).success).toBe(true)
    expect(SolarPanelNode.safeParse(makePanel({ rows: 20 })).success).toBe(true)
    expect(SolarPanelNode.safeParse(makePanel({ rows: 0 })).success).toBe(false)
    expect(SolarPanelNode.safeParse(makePanel({ rows: 21 })).success).toBe(false)
    expect(SolarPanelNode.safeParse(makePanel({ rows: 1.5 })).success).toBe(false) // non-integer
  })

  test('columns: integer in [1, 20]', () => {
    expect(SolarPanelNode.safeParse(makePanel({ columns: 1 })).success).toBe(true)
    expect(SolarPanelNode.safeParse(makePanel({ columns: 20 })).success).toBe(true)
    expect(SolarPanelNode.safeParse(makePanel({ columns: 0 })).success).toBe(false)
    expect(SolarPanelNode.safeParse(makePanel({ columns: 21 })).success).toBe(false)
  })

  test('mountingType: only "flush" or "tilted"', () => {
    expect(SolarPanelNode.safeParse(makePanel({ mountingType: 'flush' })).success).toBe(true)
    expect(SolarPanelNode.safeParse(makePanel({ mountingType: 'tilted' })).success).toBe(true)
    expect(SolarPanelNode.safeParse(makePanel({ mountingType: 'other' })).success).toBe(false)
  })
})
