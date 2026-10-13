// @ts-expect-error — bun:test is provided by the Bun runtime; viewer does not
// depend on @types/bun so the import type is unresolved at compile time.
import { describe, expect, test } from 'bun:test'
import { RoofNode, type SceneMaterial, type SceneMaterialId } from '@aedifex/core'
import type * as THREE from 'three'
import { getRoofMaterialArray } from './roof-materials'

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
