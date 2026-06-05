import { describe, expect, test } from 'bun:test'
import { GuideNode, GuideScaleReference } from './guide'

function makeGuide(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'guide_abc',
    type: 'guide',
    parentId: null,
    url: 'asset://guides/floorplan.png',
    ...overrides,
  }
}

describe('GuideNode — required url + URL refine', () => {
  test('rejects when url is missing', () => {
    const r = GuideNode.safeParse({
      id: 'guide_abc',
      type: 'guide',
      parentId: null,
    })
    expect(r.success).toBe(false)
  })

  test('rejects javascript: url', () => {
    const r = GuideNode.safeParse(makeGuide({ url: 'javascript:alert(1)' }))
    expect(r.success).toBe(false)
  })

  test('rejects file:// url', () => {
    const r = GuideNode.safeParse(makeGuide({ url: 'file:///etc/passwd' }))
    expect(r.success).toBe(false)
  })

  test('accepts data:image/png URL', () => {
    const r = GuideNode.safeParse(makeGuide({ url: 'data:image/png;base64,AAA' }))
    expect(r.success).toBe(true)
  })

  test('accepts asset:// handle', () => {
    const r = GuideNode.safeParse(makeGuide({ url: 'asset://guides/plan' }))
    expect(r.success).toBe(true)
  })
})

describe('GuideNode — defaults', () => {
  test('opacity defaults to 50 (NOT 100 like ScanNode — distinct default)', () => {
    const r = GuideNode.parse(makeGuide())
    expect(r.opacity).toBe(50)
  })

  test('opacity range is 0-100', () => {
    expect(GuideNode.safeParse(makeGuide({ opacity: 100 })).success).toBe(true)
    expect(GuideNode.safeParse(makeGuide({ opacity: 0 })).success).toBe(true)
    expect(GuideNode.safeParse(makeGuide({ opacity: 101 })).success).toBe(false)
    expect(GuideNode.safeParse(makeGuide({ opacity: -1 })).success).toBe(false)
  })

  test('position/rotation default to [0, 0, 0]', () => {
    const r = GuideNode.parse(makeGuide())
    expect(r.position).toEqual([0, 0, 0])
    expect(r.rotation).toEqual([0, 0, 0])
  })

  test('scale defaults to 1', () => {
    const r = GuideNode.parse(makeGuide())
    expect(r.scale).toBe(1)
  })

  test('scaleReference defaults to null', () => {
    const r = GuideNode.parse(makeGuide())
    expect(r.scaleReference).toBeNull()
  })
})

describe('GuideScaleReference', () => {
  test('parses a complete reference', () => {
    const ref = GuideScaleReference.parse({
      start: [0, 0],
      end: [10, 0],
      realLengthMeters: 5,
      measuredLengthUnits: 10,
      metersPerUnit: 0.5,
      label: '5m wall',
    })
    expect(ref.realLengthMeters).toBe(5)
    expect(ref.label).toBe('5m wall')
  })

  test('rejects realLengthMeters <= 0 (must be positive)', () => {
    expect(
      GuideScaleReference.safeParse({
        start: [0, 0],
        end: [10, 0],
        realLengthMeters: 0,
        measuredLengthUnits: 10,
        metersPerUnit: 0.5,
        label: 'x',
      }).success,
    ).toBe(false)
  })

  test('rejects metersPerUnit <= 0', () => {
    expect(
      GuideScaleReference.safeParse({
        start: [0, 0],
        end: [10, 0],
        realLengthMeters: 5,
        measuredLengthUnits: 10,
        metersPerUnit: 0,
        label: 'x',
      }).success,
    ).toBe(false)
  })
})
