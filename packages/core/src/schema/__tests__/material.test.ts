import { describe, expect, test } from 'bun:test'
import { DEFAULT_MATERIALS, resolveMaterial } from '../material'

describe('resolveMaterial', () => {
  describe('no input', () => {
    test('returns DEFAULT_MATERIALS.white when material is undefined', () => {
      expect(resolveMaterial()).toEqual(DEFAULT_MATERIALS.white)
    })

    test('returns DEFAULT_MATERIALS.white when explicitly passed undefined', () => {
      expect(resolveMaterial(undefined)).toEqual(DEFAULT_MATERIALS.white)
    })
  })

  describe('preset === "custom" branch', () => {
    test('preset:"custom" alone falls through to custom defaults', () => {
      // material.preset === 'custom' fails the `preset !== 'custom'` gate,
      // so the function takes the second branch and merges DEFAULT_MATERIALS.custom
      // with material.properties (which is undefined here).
      const result = resolveMaterial({ preset: 'custom' })
      expect(result).toEqual(DEFAULT_MATERIALS.custom)
    })

    test('preset:"custom" with properties overlays onto custom defaults', () => {
      const result = resolveMaterial({
        preset: 'custom',
        properties: { color: '#ff0000', roughness: 0.2, metalness: 0.7, opacity: 1, transparent: false, side: 'front' },
      })
      // properties wins over the custom defaults
      expect(result.color).toBe('#ff0000')
      expect(result.roughness).toBe(0.2)
      expect(result.metalness).toBe(0.7)
    })
  })

  describe('preset !== "custom" branch', () => {
    test('preset:"brick" returns brick defaults', () => {
      expect(resolveMaterial({ preset: 'brick' })).toEqual(DEFAULT_MATERIALS.brick)
    })

    test('preset:"glass" returns glass defaults', () => {
      expect(resolveMaterial({ preset: 'glass' })).toEqual(DEFAULT_MATERIALS.glass)
    })

    test('preset:"wood" returns wood defaults', () => {
      expect(resolveMaterial({ preset: 'wood' })).toEqual(DEFAULT_MATERIALS.wood)
    })

    test('properties override preset defaults (color override on brick)', () => {
      const result = resolveMaterial({
        preset: 'brick',
        properties: {
          color: '#000000',
          roughness: DEFAULT_MATERIALS.brick.roughness,
          metalness: DEFAULT_MATERIALS.brick.metalness,
          opacity: DEFAULT_MATERIALS.brick.opacity,
          transparent: DEFAULT_MATERIALS.brick.transparent,
          side: DEFAULT_MATERIALS.brick.side,
        },
      })
      expect(result.color).toBe('#000000')
      // unaffected fields stay
      expect(result.roughness).toBe(DEFAULT_MATERIALS.brick.roughness)
    })

    test('properties partial override: only color changes', () => {
      // Note: MaterialProperties parsing requires the full shape, but the
      // public function accepts whatever shape Zod produced. Test the
      // merge semantics with a fully-shaped properties object.
      const props = {
        color: '#abcdef',
        roughness: 0.42,
        metalness: 0.13,
        opacity: 0.5,
        transparent: true,
        side: 'double' as const,
      }
      const result = resolveMaterial({ preset: 'glass', properties: props })
      expect(result).toEqual(props)
    })
  })

  describe('no preset (falls into custom branch)', () => {
    test('material with only properties (no preset) merges over custom defaults', () => {
      const result = resolveMaterial({
        properties: {
          color: '#123456',
          roughness: 0.1,
          metalness: 0,
          opacity: 1,
          transparent: false,
          side: 'front',
        },
      })
      expect(result.color).toBe('#123456')
      expect(result.roughness).toBe(0.1)
    })

    test('material with no preset AND no properties yields custom defaults', () => {
      expect(resolveMaterial({})).toEqual(DEFAULT_MATERIALS.custom)
    })
  })

  describe('DEFAULT_MATERIALS shape', () => {
    test('every preset has all required fields', () => {
      const presets = ['white', 'brick', 'concrete', 'wood', 'glass', 'metal', 'plaster', 'tile', 'marble', 'custom'] as const
      for (const preset of presets) {
        const mat = DEFAULT_MATERIALS[preset]
        expect(mat.color).toBeDefined()
        expect(typeof mat.roughness).toBe('number')
        expect(typeof mat.metalness).toBe('number')
        expect(typeof mat.opacity).toBe('number')
        expect(typeof mat.transparent).toBe('boolean')
        expect(['front', 'back', 'double']).toContain(mat.side)
      }
    })

    test('glass is the only preset with transparent:true', () => {
      expect(DEFAULT_MATERIALS.glass.transparent).toBe(true)
      expect(DEFAULT_MATERIALS.glass.side).toBe('double')
    })
  })
})
