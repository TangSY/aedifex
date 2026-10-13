import {
  Box3,
  Matrix3,
  Matrix4,
  Mesh,
  Object3D,
  Raycaster,
  Triangle,
  Vector3,
} from 'three'

export type StandingScene = {
  floors: Mesh[]
  obstacles: Mesh[]
  fallbacks: Vector3[]
}
export type StandingSceneProvider = (root: Object3D) => StandingScene

// Narrow-phase clearance avoids rejecting an entire terrain or a concave wall's AABB.
function intersectsBody(object: Object3D, body: Box3) {
  if (!(object instanceof Mesh)) return true
  const geometry = object.geometry
  const positions = geometry.getAttribute('position')
  if (!positions) return false
  const triangle = new Triangle()
  const inverse = new Matrix4().copy(object.matrixWorld).invert()
  const localBody = body.clone().applyMatrix4(inverse)
  const intersects = (t: Triangle) => {
    triangle.copy(t)
    triangle.a.applyMatrix4(object.matrixWorld)
    triangle.b.applyMatrix4(object.matrixWorld)
    triangle.c.applyMatrix4(object.matrixWorld)
    return body.intersectsTriangle(triangle)
  }
  if (
    geometry.boundsTree &&
    geometry.boundsTree.shapecast({
      intersectsBounds: (bounds: Box3) => localBody.intersectsBox(bounds),
      intersectsTriangle: intersects,
    })
  )
    return true
  const index = geometry.index
  const localTriangle = new Triangle()
  for (
    let i = 0;
    !geometry.boundsTree && i + 2 < (index?.count ?? positions.count);
    i += 3
  ) {
    localTriangle.a.fromBufferAttribute(positions, index ? index.getX(i) : i)
    localTriangle.b.fromBufferAttribute(
      positions,
      index ? index.getX(i + 1) : i + 1,
    )
    localTriangle.c.fromBufferAttribute(
      positions,
      index ? index.getX(i + 2) : i + 2,
    )
    if (intersects(localTriangle)) return true
  }
  // Fully enclosed volumes have no surface inside the body box. Ray parity catches them.
  if (object.userData.openEntrySurface) return false
  const ray = new Raycaster(
    body.getCenter(new Vector3()),
    new Vector3(0.912, 0.327, 0.247).normalize(),
  )
  ray.layers.enableAll()
  const distances = ray
    .intersectObject(object, false)
    .map((hit) => hit.distance)
  return (
    distances.filter(
      (distance, i) => i === 0 || Math.abs(distance - distances[i - 1]!) > 1e-5,
    ).length %
      2 ===
    1
  )
}

export type StandingDestination = {
  point: Vector3
  source: 'aim' | 'fallback'
}

function visibleInHierarchy(object: Object3D) {
  for (
    let current: Object3D | null = object;
    current;
    current = current.parent
  ) {
    if (!current.visible) return false
  }
  return true
}

/** Query in life-size scene coordinates, not the scaled God-view coordinate frame.
 * The adapter must explicitly classify walkable surfaces. Never pass all scene meshes:
 * a horizontal tabletop or roof is not automatically an entry floor.
 * Obstacle bounds are deliberately conservative (false negatives are safe).
 */
export function findStandingDestination({
  aimOrigin,
  aimDirection,
  floors,
  obstacles,
  fallbacks = [],
  standingHeight = 1.8,
  radius = 0.25,
  maximumDistance = 100,
}: {
  aimOrigin: Vector3
  aimDirection: Vector3
  floors: readonly Object3D[]
  obstacles: readonly Object3D[]
  fallbacks?: readonly Vector3[]
  standingHeight?: number
  radius?: number
  maximumDistance?: number
}): StandingDestination | null {
  if (
    ![
      ...aimOrigin.toArray(),
      ...aimDirection.toArray(),
      standingHeight,
      radius,
      maximumDistance,
    ].every(Number.isFinite) ||
    aimDirection.lengthSq() < 1e-10 ||
    standingHeight <= 0 ||
    radius <= 0 ||
    maximumDistance <= 0
  )
    return null

  const floorObjects = floors.filter(visibleInHierarchy)
  const obstacleBounds = obstacles.filter(visibleInHierarchy).map((object) => {
    object.updateWorldMatrix(true, true)
    return { object, bounds: new Box3().setFromObject(object, true) }
  })
  for (const floor of floorObjects) floor.updateWorldMatrix(true, true)
  const ray = new Raycaster(
    aimOrigin,
    aimDirection.clone().normalize(),
    0,
    maximumDistance,
  )
  ray.layers.enableAll()
  const normalMatrix = new Matrix3()
  const normal = new Vector3()
  const down = new Vector3(0, -1, 0)
  const body = new Box3()

  function hasClearance(point: Vector3) {
    body.min.set(point.x - radius, point.y + 0.02, point.z - radius)
    body.max.set(
      point.x + radius,
      point.y + standingHeight + 0.1,
      point.z + radius,
    )
    if (
      obstacleBounds.some(
        ({ object, bounds }) =>
          bounds.intersectsBox(body) && intersectsBody(object, body),
      )
    )
      return false
    // Require support across the footprint, not just at its centre (ledge safety).
    for (const [x, z] of [
      [-radius, -radius],
      [-radius, radius],
      [radius, -radius],
      [radius, radius],
    ]) {
      ray.set(new Vector3(point.x + x!, point.y + 0.1, point.z + z!), down)
      ray.far = 0.2
      const support = ray
        .intersectObjects(floorObjects, false)
        .find((hit) => visibleInHierarchy(hit.object))
      if (!support || Math.abs(support.point.y - point.y) > 0.08) return false
    }
    return true
  }

  function firstFloor() {
    return ray.intersectObjects(floorObjects, false).find((hit) => {
      if (!hit.face || !visibleInHierarchy(hit.object)) return false
      normal
        .copy(hit.face.normal)
        .applyMatrix3(normalMatrix.getNormalMatrix(hit.object.matrixWorld))
        .normalize()
      return normal.y >= Math.cos(Math.PI / 6)
    })
  }

  const aimed = firstFloor()
  const obstruction = ray.intersectObjects(
    obstacleBounds.map(({ object }) => object),
    false,
  )[0]
  if (
    aimed &&
    (!obstruction || obstruction.distance >= aimed.distance - 0.005) &&
    hasClearance(aimed.point)
  )
    return { point: aimed.point.clone(), source: 'aim' }
  // Fallbacks are explicit spawn/last-safe hints; always revalidate their floor and clearance.
  for (const hint of fallbacks) {
    if (!hint.toArray().every(Number.isFinite)) continue
    ray.set(hint.clone().add(new Vector3(0, 0.2, 0)), down)
    ray.far = 0.4
    const floor = firstFloor()
    if (floor && hasClearance(floor.point))
      return { point: floor.point.clone(), source: 'fallback' }
  }
  return null
}

/** Compensate room-scale head offset after applying the desired arrival yaw. */
export function standingOriginPose(
  point: Vector3,
  viewerPosition: Vector3,
  viewerYaw: number,
  arrivalYaw: number,
) {
  const yaw = arrivalYaw - viewerYaw
  const offset = viewerPosition
    .clone()
    .applyAxisAngle(new Vector3(0, 1, 0), yaw)
  return {
    position: new Vector3(point.x - offset.x, point.y, point.z - offset.z),
    yaw,
  }
}
