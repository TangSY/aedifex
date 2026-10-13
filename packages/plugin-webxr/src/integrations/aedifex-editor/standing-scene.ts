import { sceneRegistry, useScene } from '@aedifex/core'
import {
  DoubleSide,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Vector3,
} from 'three'
import type { StandingScene } from '../../xr/mode-switching/lib/standing-destination'

const queryMaterial = new MeshBasicMaterial({ side: DoubleSide })
const nonPhysical = new Set(['building', 'level', 'zone', 'spawn'])
// Sculpted terrain and the bare ground fill are owned by `site`, not a terrain node.
const walkable = new Set(['site', 'slab', 'terrain', 'road'])

/** Detached query meshes share geometry but never mutate rendered transforms/materials.
 * Originals stay available even when the editor draws batched copies on another layer.
 */
export function collectAedifexStandingScene(root: Object3D): StandingScene {
  return collectStandingScene(
    root,
    useScene.getState().nodes,
    sceneRegistry.nodes,
  )
}

export function collectStandingScene(
  root: Object3D,
  nodes: Readonly<
    Record<string, { type: string; visible?: boolean } | undefined>
  >,
  registry: ReadonlyMap<string, Object3D>,
): StandingScene {
  root.updateWorldMatrix(true, true)
  const inverseRoot = new Matrix4().copy(root.matrixWorld).invert()
  const owners = new Map<Object3D, string>()
  for (const [id, object] of registry) owners.set(object, id)
  const result: StandingScene = { floors: [], obstacles: [], fallbacks: [] }
  root.traverseVisible((object) => {
    const id = owners.get(object)
    const node = id ? nodes[id as keyof typeof nodes] : undefined
    if (node?.type === 'spawn' && node.visible !== false) {
      result.fallbacks.push(
        object.getWorldPosition(new Vector3()).applyMatrix4(inverseRoot),
      )
    }
    if (
      !(object instanceof Mesh) ||
      object.userData.excludeFromBvh === true ||
      object.userData.aedifexExport === 'strip' ||
      object.userData.editorHandleHitArea === true
    )
      return
    let owner: Object3D | null = object
    while (owner && !owners.has(owner)) owner = owner.parent
    const ownerId = owner && owners.get(owner)
    const ownerNode = ownerId ? nodes[ownerId as keyof typeof nodes] : undefined
    if (
      !ownerNode ||
      ownerNode.visible === false ||
      nonPhysical.has(ownerNode.type)
    )
      return
    // Batched/instanced render copies are not individual collision surfaces.
    if ('isBatchedMesh' in object) return
    const count = object instanceof InstancedMesh ? object.count : 1
    for (let i = 0; i < count; i++) {
      const proxy = new Mesh(object.geometry, queryMaterial)
      proxy.userData.openEntrySurface = ownerNode.type === 'site'
      proxy.matrixAutoUpdate = false
      proxy.matrix.multiplyMatrices(inverseRoot, object.matrixWorld)
      if (object instanceof InstancedMesh) {
        const instance = new Matrix4()
        object.getMatrixAt(i, instance)
        proxy.matrix.multiply(instance)
      }
      proxy.updateMatrixWorld(true)
      result.obstacles.push(proxy)
      if (walkable.has(ownerNode.type)) result.floors.push(proxy)
    }
  })
  return result
}
