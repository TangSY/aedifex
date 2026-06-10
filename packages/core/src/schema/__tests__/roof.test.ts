import { describe, expect, test } from 'bun:test'
import { getEffectiveRoofSurfaceMaterial, RoofNode } from '../nodes/roof'

const MIN_ROOF = { id: 'roof_a', type: 'roof' as const }

describe('RoofNode.parse', () => {
  test('parses minimal roof, defaults applied', () => {
    const r = RoofNode.parse(MIN_ROOF)
    expect(r.position).toEqual([0, 0, 0])
    expect(r.rotation).toBe(0)
    expect(r.children).toEqual([])
  })

  test('idempotent', () => {
    const once = RoofNode.parse(MIN_ROOF)
    const twice = RoofNode.parse(once)
    expect(twice).toEqual(once)
  })

  test('accepts roof segment children IDs', () => {
    const r = RoofNode.parse({
      ...MIN_ROOF,
      children: ['rseg_a', 'rseg_b'],
    })
    expect(r.children).toEqual(['rseg_a', 'rseg_b'])
  })
})

describe('getEffectiveRoofSurfaceMaterial', () => {
  describe('role: top', () => {
    test('topMaterial set → returns topMaterial', () => {
      const node = RoofNode.parse({
        ...MIN_ROOF,
        topMaterial: { preset: 'metal' },
      })
      const spec = getEffectiveRoofSurfaceMaterial(node, 'top')
      expect(spec.material).toEqual({ preset: 'metal' })
    })

    test('topMaterialPreset alone → returns the preset only', () => {
      const node = RoofNode.parse({
        ...MIN_ROOF,
        topMaterialPreset: 'shingle-gray',
      })
      const spec = getEffectiveRoofSurfaceMaterial(node, 'top')
      expect(spec.materialPreset).toBe('shingle-gray')
      expect(spec.material).toBeUndefined()
    })

    test('top unset → falls back to legacy', () => {
      const node = RoofNode.parse({
        ...MIN_ROOF,
        materialPreset: 'legacy-tile',
      })
      const spec = getEffectiveRoofSurfaceMaterial(node, 'top')
      expect(spec.materialPreset).toBe('legacy-tile')
    })
  })

  describe('role: edge', () => {
    test('edge unset does NOT bleed from wallMaterial (no cross-role fallback, upstream #372)', () => {
      // Upstream 46f94b97 removed the edge↔wall cross-role fallback:
      // painting one surface must never bleed onto the others. An unset
      // edge with only wallMaterial set resolves to the legacy catch-all
      // (here absent → empty spec), NOT to the wall material.
      const node = RoofNode.parse({
        ...MIN_ROOF,
        wallMaterial: { preset: 'brick' },
      })
      const spec = getEffectiveRoofSurfaceMaterial(node, 'edge')
      expect(spec.material).toBeUndefined()
      expect(spec.materialPreset).toBeUndefined()
    })

    test('edgeMaterial wins over wallMaterial when both set', () => {
      const node = RoofNode.parse({
        ...MIN_ROOF,
        edgeMaterial: { preset: 'metal' },
        wallMaterial: { preset: 'brick' },
      })
      const spec = getEffectiveRoofSurfaceMaterial(node, 'edge')
      expect(spec.material).toEqual({ preset: 'metal' })
    })

    test('all role and fallback materials unset → falls through to legacy', () => {
      const node = RoofNode.parse({
        ...MIN_ROOF,
        material: { preset: 'concrete' },
      })
      const spec = getEffectiveRoofSurfaceMaterial(node, 'edge')
      expect(spec.material).toEqual({ preset: 'concrete' })
    })
  })

  describe('role: wall', () => {
    test('wallMaterial set → returns it', () => {
      const node = RoofNode.parse({
        ...MIN_ROOF,
        wallMaterial: { preset: 'plaster' },
      })
      const spec = getEffectiveRoofSurfaceMaterial(node, 'wall')
      expect(spec.material).toEqual({ preset: 'plaster' })
    })

    test('wall unset does NOT bleed from edgeMaterial (no cross-role fallback, upstream #372)', () => {
      // Same no-bleed contract as the edge case above: unset wall resolves
      // to the legacy catch-all / theme default, never to edgeMaterial.
      const node = RoofNode.parse({
        ...MIN_ROOF,
        edgeMaterial: { preset: 'metal' },
      })
      const spec = getEffectiveRoofSurfaceMaterial(node, 'wall')
      expect(spec.material).toBeUndefined()
      expect(spec.materialPreset).toBeUndefined()
    })

    test('wall unset with legacy material set → falls through to legacy', () => {
      const node = RoofNode.parse({
        ...MIN_ROOF,
        edgeMaterial: { preset: 'metal' },
        material: { preset: 'concrete' },
      })
      const spec = getEffectiveRoofSurfaceMaterial(node, 'wall')
      expect(spec.material).toEqual({ preset: 'concrete' })
    })
  })
})
