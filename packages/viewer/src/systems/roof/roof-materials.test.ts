// @ts-expect-error — bun:test is provided by the Bun runtime; viewer does not
// depend on @types/bun so the import type is unresolved at compile time.
import { describe, expect, test } from 'bun:test'
import { type AnyNode, Assembly, BuildingNode, LevelNode, RoofNode, type SceneMaterial, type SceneMaterialId, WallNode } from '@aedifex/core'
import type * as THREE from 'three'
import { getRoofMaterialArray, levelWallCladdingRef } from './roof-materials'

function sceneMaterial(color: string): SceneMaterial {
  return {
    id: 'mat_roof',
    name: 'Roof finish',
    material: {
      properties: {
        color,
        roughness: 0.5,
        metalness: 0,
        opacity: 1,
        transparent: false,
        side: 'front',
      },
    },
  }
}

describe('roof material slots', () => {
  test('resolves a scene material into the matching roof mesh group', () => {
    const node = RoofNode.parse({ slots: { shingle: 'scene:mat_roof' } })
    const materials = {
      mat_roof: sceneMaterial('#123456'),
    } as Record<SceneMaterialId, SceneMaterial>

    const result = getRoofMaterialArray(node, 'rendered', true, 'clay', undefined, null, materials)
    const shingle = result?.[3] as THREE.MeshStandardMaterial

    expect(shingle.color.getHexString()).toBe('123456')
  })

  test('invalidates the roof cache when a referenced scene material changes', () => {
    const node = RoofNode.parse({ slots: { fascia: 'scene:mat_roof' } })
    const first = getRoofMaterialArray(node, 'rendered', true, 'clay', undefined, null, {
      mat_roof: sceneMaterial('#111111'),
    } as Record<SceneMaterialId, SceneMaterial>)
    const second = getRoofMaterialArray(node, 'rendered', true, 'clay', undefined, null, {
      mat_roof: sceneMaterial('#eeeeee'),
    } as Record<SceneMaterialId, SceneMaterial>)

    expect((first?.[0] as THREE.MeshStandardMaterial).color.getHexString()).toBe('111111')
    expect((second?.[0] as THREE.MeshStandardMaterial).color.getHexString()).toBe('eeeeee')
    expect(second).not.toBe(first)
  })

  test('a dangling slot falls back to a legacy scene ref and tracks that material changing', () => {
    const node = RoofNode.parse({
      slots: { shingle: 'scene:missing' },
      topMaterialPreset: 'scene:mat_roof',
    })
    const first = getRoofMaterialArray(node, 'rendered', true, 'clay', undefined, null, {
      mat_roof: sceneMaterial('#222222'),
    } as Record<SceneMaterialId, SceneMaterial>)
    const second = getRoofMaterialArray(node, 'rendered', true, 'clay', undefined, null, {
      mat_roof: sceneMaterial('#dddddd'),
    } as Record<SceneMaterialId, SceneMaterial>)

    expect((first?.[3] as THREE.MeshStandardMaterial).color.getHexString()).toBe('222222')
    expect((second?.[3] as THREE.MeshStandardMaterial).color.getHexString()).toBe('dddddd')
    expect(second).not.toBe(first)
  })
})

// A roof on its building's roof level stands on the storey below: its gables are clad like that
// storey's walls, not the bare drywall default.
const stucco = Assembly.parse({
  face: 'exterior',
  layers: [
    { id: 'studs', role: 'structure', thickness: 0.14, core: true, material: 'wood' },
    { id: 'stucco', role: 'finish', thickness: 0.02, material: 'stucco' },
  ],
})

function house(roofOn: 'level_g' | 'level_r') {
  const wall = WallNode.parse({
    id: 'wall_g',
    parentId: 'level_g',
    start: [0, 0],
    end: [6, 0],
    assembly: stucco,
  })
  const roof = RoofNode.parse({ id: 'roof_main', parentId: roofOn })
  const ground = LevelNode.parse({
    id: 'level_g',
    parentId: 'building_h',
    level: 0,
    height: 2.5,
    children: [wall.id, ...(roofOn === 'level_g' ? [roof.id] : [])],
  })
  const roofLevel = LevelNode.parse({
    id: 'level_r',
    parentId: 'building_h',
    level: 1,
    children: roofOn === 'level_r' ? [roof.id] : [],
    metadata: { role: 'roof' },
  })
  const building = BuildingNode.parse({ id: 'building_h', children: [ground.id, roofLevel.id] })
  const nodes: Record<string, AnyNode> = Object.fromEntries(
    [building, ground, roofLevel, wall, roof].map((node) => [node.id, node]),
  )
  return { nodes, roof }
}

describe('levelWallCladdingRef', () => {
  test("a roof on the storey's own level takes its walls' cladding", () => {
    const { nodes, roof } = house('level_g')
    expect(levelWallCladdingRef(nodes, roof)).toBe('library:concrete-stucco')
  })

  test('a roof on the roof level takes the cladding of the storey below', () => {
    const { nodes, roof } = house('level_r')
    expect(levelWallCladdingRef(nodes, roof)).toBe('library:concrete-stucco')
  })
})
