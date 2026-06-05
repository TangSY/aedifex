import { describe, expect, test } from 'bun:test'
import {
  getActiveRoofHeight,
  getEffectiveSegmentSurfaceMaterial,
  hasSegmentMaterialOverride,
  ROOF_SHAPE_DEFAULTS,
  RoofSegmentNode,
} from '../nodes/roof-segment'

const MIN_SEG = { id: 'rseg_a', type: 'roof-segment' as const }

describe('RoofSegmentNode.parse', () => {
  describe('defaults', () => {
    test('minimal segment supplies all geometry defaults', () => {
      const s = RoofSegmentNode.parse(MIN_SEG)
      expect(s.roofType).toBe('gable')
      expect(s.width).toBe(8)
      expect(s.depth).toBe(6)
      expect(s.wallHeight).toBe(0.5)
      expect(s.pitch).toBe(40)
      expect(s.wallThickness).toBe(0.1)
      expect(s.deckThickness).toBe(0.1)
      expect(s.overhang).toBe(0.3)
      expect(s.shingleThickness).toBe(0.05)
    })

    test('shape ratios default to ROOF_SHAPE_DEFAULTS', () => {
      const s = RoofSegmentNode.parse(MIN_SEG)
      expect(s.gambrelLowerWidthRatio).toBe(ROOF_SHAPE_DEFAULTS.gambrelLowerWidthRatio)
      expect(s.gambrelLowerHeightRatio).toBe(ROOF_SHAPE_DEFAULTS.gambrelLowerHeightRatio)
      expect(s.mansardSteepWidthRatio).toBe(ROOF_SHAPE_DEFAULTS.mansardSteepWidthRatio)
      expect(s.mansardSteepHeightRatio).toBe(ROOF_SHAPE_DEFAULTS.mansardSteepHeightRatio)
      expect(s.dutchHipWidthRatio).toBe(ROOF_SHAPE_DEFAULTS.dutchHipWidthRatio)
      expect(s.dutchHipHeightRatio).toBe(ROOF_SHAPE_DEFAULTS.dutchHipHeightRatio)
    })

    test('idempotent', () => {
      const once = RoofSegmentNode.parse(MIN_SEG)
      const twice = RoofSegmentNode.parse(once)
      expect(twice).toEqual(once)
    })
  })

  describe('pitch validation', () => {
    test('accepts pitch within (0, 85] range', () => {
      expect(RoofSegmentNode.parse({ ...MIN_SEG, pitch: 30 }).pitch).toBe(30)
      expect(RoofSegmentNode.parse({ ...MIN_SEG, pitch: 0 }).pitch).toBe(0) // allowed: min(0)
      expect(RoofSegmentNode.parse({ ...MIN_SEG, pitch: 85 }).pitch).toBe(85)
    })

    test('rejects pitch > 85', () => {
      expect(() => RoofSegmentNode.parse({ ...MIN_SEG, pitch: 86 })).toThrow()
    })

    test('rejects negative pitch', () => {
      expect(() => RoofSegmentNode.parse({ ...MIN_SEG, pitch: -1 })).toThrow()
    })
  })

  describe('roofType enum', () => {
    test('accepts each roof type', () => {
      const types = ['hip', 'gable', 'shed', 'gambrel', 'dutch', 'mansard', 'flat']
      for (const t of types) {
        const s = RoofSegmentNode.parse({ ...MIN_SEG, roofType: t })
        expect(s.roofType).toBe(t as typeof s.roofType)
      }
    })

    test('rejects unknown roofType', () => {
      expect(() => RoofSegmentNode.parse({ ...MIN_SEG, roofType: 'monitor' })).toThrow()
    })

    test('hip roof segment parses with default constraints intact', () => {
      const s = RoofSegmentNode.parse({ ...MIN_SEG, roofType: 'hip' })
      expect(s.roofType).toBe('hip')
      // pitch / width / depth defaults
      expect(s.pitch).toBe(40)
      expect(s.width).toBe(8)
      expect(s.depth).toBe(6)
    })
  })

  describe('shape ratio ranges', () => {
    test('rejects gambrelLowerWidthRatio < 0.1', () => {
      expect(() => RoofSegmentNode.parse({ ...MIN_SEG, gambrelLowerWidthRatio: 0.05 })).toThrow()
    })

    test('rejects gambrelLowerWidthRatio > 0.9', () => {
      expect(() => RoofSegmentNode.parse({ ...MIN_SEG, gambrelLowerWidthRatio: 0.95 })).toThrow()
    })

    test('mansardSteepWidthRatio bounded to [0.05, 0.45]', () => {
      expect(() => RoofSegmentNode.parse({ ...MIN_SEG, mansardSteepWidthRatio: 0.5 })).toThrow()
      expect(() => RoofSegmentNode.parse({ ...MIN_SEG, mansardSteepWidthRatio: 0.04 })).toThrow()
      expect(RoofSegmentNode.parse({ ...MIN_SEG, mansardSteepWidthRatio: 0.4 }).mansardSteepWidthRatio).toBe(0.4)
    })
  })
})

describe('getActiveRoofHeight', () => {
  test('flat roof has activeRh 0', () => {
    const s = RoofSegmentNode.parse({ ...MIN_SEG, roofType: 'flat' })
    expect(getActiveRoofHeight(s)).toBe(0)
  })

  test('zero pitch falls into flat-frame branch (activeRh 0)', () => {
    const s = RoofSegmentNode.parse({ ...MIN_SEG, pitch: 0 })
    expect(getActiveRoofHeight(s)).toBe(0)
  })

  test('gable with non-zero pitch produces positive activeRh', () => {
    const s = RoofSegmentNode.parse({ ...MIN_SEG, roofType: 'gable', pitch: 45 })
    expect(getActiveRoofHeight(s)).toBeGreaterThan(0)
  })
})

describe('hasSegmentMaterialOverride', () => {
  test('default segment has no override', () => {
    const s = RoofSegmentNode.parse(MIN_SEG)
    expect(hasSegmentMaterialOverride(s)).toBe(false)
  })

  test('segment with topMaterialPreset is overridden', () => {
    const s = RoofSegmentNode.parse({ ...MIN_SEG, topMaterialPreset: 'shingle' })
    expect(hasSegmentMaterialOverride(s)).toBe(true)
  })

  test('segment with catch-all material is overridden', () => {
    const s = RoofSegmentNode.parse({ ...MIN_SEG, material: { preset: 'wood' } })
    expect(hasSegmentMaterialOverride(s)).toBe(true)
  })
})

describe('getEffectiveSegmentSurfaceMaterial', () => {
  test('role: top with topMaterial set wins', () => {
    const s = RoofSegmentNode.parse({ ...MIN_SEG, topMaterial: { preset: 'metal' } })
    const spec = getEffectiveSegmentSurfaceMaterial(s, 'top')
    expect(spec.material).toEqual({ preset: 'metal' })
  })

  test('role: top unset → falls through to catch-all material', () => {
    const s = RoofSegmentNode.parse({ ...MIN_SEG, material: { preset: 'wood' } })
    const spec = getEffectiveSegmentSurfaceMaterial(s, 'top')
    expect(spec.material).toEqual({ preset: 'wood' })
  })

  test('catch-all empty → falls through to parentFallback', () => {
    const s = RoofSegmentNode.parse(MIN_SEG)
    const spec = getEffectiveSegmentSurfaceMaterial(s, 'top', { materialPreset: 'parent-fallback' })
    expect(spec.materialPreset).toBe('parent-fallback')
  })

  test('no fallback → returns spec with undefined material/preset', () => {
    const s = RoofSegmentNode.parse(MIN_SEG)
    const spec = getEffectiveSegmentSurfaceMaterial(s, 'top')
    expect(spec.material).toBeUndefined()
    expect(spec.materialPreset).toBeUndefined()
  })
})
