import { expect, test } from 'bun:test'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { splitWallAtSlopeClamp } from './wall-slope-geometry'

test('splitting through an existing vertex preserves UVs without degenerate triangles', () => {
  const source = new BufferGeometry()
  source.setAttribute('position', new Float32BufferAttribute([-1, 0, 0, 0, 1, 0, 1, 0, 0], 3))
  source.setAttribute('uv', new Float32BufferAttribute([0, 0, 0.5, 1, 1, 0], 2))
  const result = splitWallAtSlopeClamp(source, 0)
  try {
    const positions = result.getAttribute('position')
    const uv = result.getAttribute('uv')
    expect(positions.count).toBe(6)
    expect(uv.count).toBe(6)
    for (let i = 0; i < positions.count; i++) {
      expect(uv.getX(i)).toBeCloseTo((positions.getX(i) + 1) / 2)
      expect(uv.getY(i)).toBeCloseTo(positions.getY(i))
    }
  } finally {
    source.dispose()
    result.dispose()
  }
})

test('a transverse clamp clips triangles on an oblique plane without losing UVs', () => {
  const source = new BufferGeometry()
  source.setAttribute('position', new Float32BufferAttribute([-1, 0, -1, 1, 1, -1, 0, 0, 1], 3))
  source.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 1, 0.5, 0], 2))
  const result = splitWallAtSlopeClamp(source, { x: 1, z: 1, offset: 0 })
  try {
    const positions = result.getAttribute('position')
    const uv = result.getAttribute('uv')
    expect(positions.count).toBeGreaterThan(3)
    for (let i = 0; i < positions.count; i++) {
      expect(uv.getX(i)).toBeCloseTo((positions.getX(i) + 1) / 2)
      expect(uv.getY(i)).toBeCloseTo(positions.getY(i))
    }
    for (let i = 0; i < positions.count; i += 3) {
      const distances = [0, 1, 2].map((n) => positions.getX(i + n) + positions.getZ(i + n))
      expect(Math.min(...distances) >= -1e-6 || Math.max(...distances) <= 1e-6).toBe(true)
    }
  } finally {
    source.dispose()
    result.dispose()
  }
})
