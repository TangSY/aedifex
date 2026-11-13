import { describe, expect, test } from 'bun:test'
import { resolvePreciseWallEnd } from './precise-wall-end'

const base = {
  start: [1, 2] as [number, number],
  pointer: [4, 6] as [number, number],
  lengthText: '',
  angleText: '',
  lengthOptions: { bareUnit: 'm', system: 'metric' as const },
}

describe('precise wall draft endpoint', () => {
  test('uses the pointer direction for an exact distance', () => {
    const result = resolvePreciseWallEnd({ ...base, lengthText: '250cm' })
    expect(result.status).toBe('ready')
    if (result.status === 'ready') {
      expect(result.point[0]).toBeCloseTo(2.5)
      expect(result.point[1]).toBeCloseTo(4)
    }
  })
  test('accepts a fully specified heading before pointer movement', () => {
    const result = resolvePreciseWallEnd({
      ...base,
      pointer: base.start,
      lengthText: '2',
      angleText: '90',
    })
    expect(result.status).toBe('ready')
    if (result.status === 'ready') {
      expect(result.point[0]).toBeCloseTo(1)
      expect(result.point[1]).toBeCloseTo(4)
    }
  })
  test('projects and quantizes only the unspecified length', () => {
    const result = resolvePreciseWallEnd({ ...base, angleText: '90', step: 0.5 })
    expect(result.status).toBe('ready')
    if (result.status === 'ready') {
      expect(result.point[0]).toBeCloseTo(1)
      expect(result.point[1]).toBeCloseTo(6)
    }
  })
  test('does not silently commit when a field is invalid or direction is missing', () => {
    expect(resolvePreciseWallEnd({ ...base, lengthText: '0', angleText: '90' }).status).toBe(
      'invalid',
    )
    expect(
      resolvePreciseWallEnd({ ...base, lengthText: '2', angleText: 'not-a-number' }).status,
    ).toBe('invalid')
    expect(resolvePreciseWallEnd({ ...base, pointer: base.start, lengthText: '2' }).status).toBe(
      'needs-direction',
    )
    expect(resolvePreciseWallEnd(base).status).toBe('empty')
  })
})
