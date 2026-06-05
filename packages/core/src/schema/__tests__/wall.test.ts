import { describe, expect, test } from 'bun:test'
import {
  getEffectiveWallSurfaceMaterial,
  getWallSurfaceMaterialSignature,
  WallNode,
} from '../nodes/wall'

const VALID_WALL = {
  id: 'wall_a',
  type: 'wall' as const,
  start: [0, 0] as [number, number],
  end: [1, 0] as [number, number],
}

describe('WallNode.parse', () => {
  describe('schema validity', () => {
    test('accepts a minimal wall (start/end provided)', () => {
      const w = WallNode.parse(VALID_WALL)
      expect(w.id).toBe('wall_a')
      expect(w.start).toEqual([0, 0])
      expect(w.end).toEqual([1, 0])
    })

    test('defaults: children:[], frontSide/backSide:unknown', () => {
      const w = WallNode.parse(VALID_WALL)
      expect(w.children).toEqual([])
      expect(w.frontSide).toBe('unknown')
      expect(w.backSide).toBe('unknown')
    })

    test('idempotent', () => {
      const once = WallNode.parse(VALID_WALL)
      const twice = WallNode.parse(once)
      expect(twice).toEqual(once)
    })
  })

  describe('start/end tuple validation', () => {
    test('rejects start: [0] (single-element tuple)', () => {
      expect(() =>
        WallNode.parse({
          ...VALID_WALL,
          start: [0],
        }),
      ).toThrow()
    })

    test('rejects start: [] (empty tuple)', () => {
      expect(() =>
        WallNode.parse({
          ...VALID_WALL,
          start: [],
        }),
      ).toThrow()
    })

    test('rejects end with three elements', () => {
      expect(() =>
        WallNode.parse({
          ...VALID_WALL,
          end: [1, 0, 0],
        }),
      ).toThrow()
    })

    test('rejects non-numeric start coordinate', () => {
      expect(() =>
        WallNode.parse({
          ...VALID_WALL,
          start: ['x', 0],
        }),
      ).toThrow()
    })
  })

  describe('curveOffset (curved walls)', () => {
    test('accepts curveOffset > 0 (curved wall) without throwing', () => {
      const w = WallNode.parse({
        ...VALID_WALL,
        curveOffset: 0.5,
      })
      expect(w.curveOffset).toBe(0.5)
    })

    test('accepts curveOffset = 0 (straight wall encoded explicitly)', () => {
      const w = WallNode.parse({
        ...VALID_WALL,
        curveOffset: 0,
      })
      expect(w.curveOffset).toBe(0)
    })

    test('accepts negative curveOffset (wall bowed the other way)', () => {
      const w = WallNode.parse({
        ...VALID_WALL,
        curveOffset: -0.3,
      })
      expect(w.curveOffset).toBe(-0.3)
    })

    test('omitting curveOffset leaves it undefined', () => {
      const w = WallNode.parse(VALID_WALL)
      expect(w.curveOffset).toBeUndefined()
    })
  })

  describe('frontSide / backSide enum', () => {
    test('explicit interior/exterior stick', () => {
      const w = WallNode.parse({
        ...VALID_WALL,
        frontSide: 'interior',
        backSide: 'exterior',
      })
      expect(w.frontSide).toBe('interior')
      expect(w.backSide).toBe('exterior')
    })

    test('rejects unknown side value', () => {
      expect(() =>
        WallNode.parse({
          ...VALID_WALL,
          frontSide: 'sideways',
        }),
      ).toThrow()
    })
  })
})

describe('getEffectiveWallSurfaceMaterial', () => {
  test('interior surface unset → falls back to legacy material/preset', () => {
    const wall = WallNode.parse({
      ...VALID_WALL,
      material: undefined,
      materialPreset: 'legacy-stucco',
    })
    const spec = getEffectiveWallSurfaceMaterial(wall, 'interior')
    expect(spec.materialPreset).toBe('legacy-stucco')
    expect(spec.material).toBeUndefined()
  })

  test('interior surface set via interiorMaterialPreset alone wins (hasSurfaceMaterial uses typeof)', () => {
    const wall = WallNode.parse({
      ...VALID_WALL,
      interiorMaterialPreset: 'wallpaper-1',
      // legacy fallback should be ignored:
      materialPreset: 'should-not-show',
    })
    const spec = getEffectiveWallSurfaceMaterial(wall, 'interior')
    expect(spec.materialPreset).toBe('wallpaper-1')
    // The configured branch returns interiorMaterial which is undefined here
    expect(spec.material).toBeUndefined()
  })

  test('interior surface set via interiorMaterial object alone wins', () => {
    const wall = WallNode.parse({
      ...VALID_WALL,
      interiorMaterial: { preset: 'wood' },
      materialPreset: 'should-not-show',
    })
    const spec = getEffectiveWallSurfaceMaterial(wall, 'interior')
    expect(spec.material).toEqual({ preset: 'wood' })
    expect(spec.materialPreset).toBeUndefined()
  })

  test('exterior surface unset → falls back to legacy material/preset', () => {
    const wall = WallNode.parse({
      ...VALID_WALL,
      materialPreset: 'stucco',
    })
    const spec = getEffectiveWallSurfaceMaterial(wall, 'exterior')
    expect(spec.materialPreset).toBe('stucco')
  })

  test('exterior surface configured wins over legacy', () => {
    const wall = WallNode.parse({
      ...VALID_WALL,
      exteriorMaterialPreset: 'brick-red',
      materialPreset: 'should-not-show',
    })
    const spec = getEffectiveWallSurfaceMaterial(wall, 'exterior')
    expect(spec.materialPreset).toBe('brick-red')
  })

  test('both surfaces unset → both report legacy material', () => {
    const wall = WallNode.parse({
      ...VALID_WALL,
      material: { preset: 'concrete' },
    })
    const interior = getEffectiveWallSurfaceMaterial(wall, 'interior')
    const exterior = getEffectiveWallSurfaceMaterial(wall, 'exterior')
    expect(interior.material).toEqual({ preset: 'concrete' })
    expect(exterior.material).toEqual({ preset: 'concrete' })
  })
})

describe('getWallSurfaceMaterialSignature', () => {
  test('signature is stable for identical specs', () => {
    const a = getWallSurfaceMaterialSignature({ materialPreset: 'wood' })
    const b = getWallSurfaceMaterialSignature({ materialPreset: 'wood' })
    expect(a).toBe(b)
  })

  test('signature differs when materialPreset differs', () => {
    const a = getWallSurfaceMaterialSignature({ materialPreset: 'wood' })
    const b = getWallSurfaceMaterialSignature({ materialPreset: 'brick' })
    expect(a).not.toBe(b)
  })

  test('unset preset and unset material → both null in signature', () => {
    const sig = getWallSurfaceMaterialSignature({})
    expect(sig).toBe(JSON.stringify({ material: null, materialPreset: null }))
  })
})
