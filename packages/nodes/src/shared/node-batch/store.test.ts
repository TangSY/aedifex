import { expect, test } from 'bun:test'
import { BoxGeometry, Group, Matrix4, Mesh, MeshBasicMaterial } from 'three'
import { prepareSceneForExport } from '../../../../editor/src/lib/glb-export'
import { NodeBatchStore } from './store'

test('scene export strips packed node batches and retains the original source geometry', () => {
  const root = new Group()
  const geometry = new BoxGeometry()
  const material = new MeshBasicMaterial()
  const mesh = new Mesh(geometry, material)
  mesh.name = 'original-window-frame'
  root.add(mesh)
  const store = new NodeBatchStore(() => root)
  try {
    store.join(
      [
        {
          nodeId: 'window_export',
          levelId: 'level_export',
          entries: [
            {
              nodeId: 'window_export',
              levelId: 'level_export',
              mesh,
              geometry,
              material,
              matrixInLevel: new Matrix4(),
            },
          ],
        },
      ],
      1,
    )
    expect(root.getObjectByName('item-batch')).toBeDefined()
    // Exercise the direct export path, without a before-capture event releasing batches.
    const exported = prepareSceneForExport(root, {}).scene
    expect(exported.getObjectByName('item-batch')).toBeUndefined()
    expect(exported.getObjectByName(mesh.name)).toBeDefined()
    expect(root.getObjectByName('item-batch')).toBeDefined()
  } finally {
    store.disposeAll()
    geometry.dispose()
    material.dispose()
  }
})
