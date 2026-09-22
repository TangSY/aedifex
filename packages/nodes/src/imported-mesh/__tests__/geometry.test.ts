import { describe, expect, test } from 'bun:test'
import { ImportedMeshNode } from '@aedifex/core'
import type { Mesh } from 'three'
import { importedMeshDefinition } from '../definition'
import { buildImportedMeshGeometry } from '../geometry'

describe('buildImportedMeshGeometry', () => {
  test('builds indexed colored triangle primitives', () => {
    const node = ImportedMeshNode.parse({
      id: 'imesh_test',
      type: 'imported-mesh',
      primitives: [
        {
          positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
          indices: [0, 1, 2],
          color: '#ff0000',
        },
      ],
    })
    const group = buildImportedMeshGeometry(node)
    expect(group.children).toHaveLength(1)
    const mesh = group.children[0] as Mesh
    expect(mesh.geometry.getAttribute('position').count).toBe(3)
    expect(mesh.geometry.index?.count).toBe(3)
  })

  test('computes finite normals for every vertex shared by indexed triangles', () => {
    const node = ImportedMeshNode.parse({
      id: 'imesh_indexed_quad',
      type: 'imported-mesh',
      primitives: [{
        positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
        indices: [0, 1, 2, 0, 2, 3],
        color: '#ffffff',
      }],
    })
    const group = buildImportedMeshGeometry(node)
    const mesh = group.children[0] as Mesh
    const normals = mesh.geometry.getAttribute('normal')

    expect(normals.count).toBe(4)
    for (let vertex = 0; vertex < normals.count; vertex++) {
      expect(normals.getX(vertex)).toBeCloseTo(0)
      expect(normals.getY(vertex)).toBeCloseTo(0)
      expect(normals.getZ(vertex)).toBeCloseTo(1)
    }
  })

  test('is selectable and deletable but not movable', () => {
    expect(importedMeshDefinition.capabilities.selectable).toBeDefined()
    expect(importedMeshDefinition.capabilities.deletable).toBe(true)
    expect('movable' in importedMeshDefinition.capabilities).toBe(false)
  })
})
