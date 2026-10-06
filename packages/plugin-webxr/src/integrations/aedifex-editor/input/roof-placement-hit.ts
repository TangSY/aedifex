import type { Object3D, Raycaster } from 'three'

/** Ignore invisible helper geometry and keep the nearest registered surface. */
export function xrPlacementSurfaceHit<T extends { type: string }>(
  scene: Object3D,
  raycaster: Raycaster,
  registered: ReadonlyMap<Object3D, T>,
) {
  scene.updateWorldMatrix(true, true)
  for (const hit of raycaster.intersectObject(scene, true)) {
    let visible = true
    let node: T | undefined
    for (let object: Object3D | null = hit.object; object; object = object.parent) {
      if (!object.visible || object.pointerEvents === 'none') visible = false
      const ancestor = registered.get(object)
      if (!node || (node.type === 'roof-segment' && ancestor?.type === 'roof')) node = ancestor ?? node
    }
    if (!visible || !node) continue
    return { hit, node }
  }
  return null
}
