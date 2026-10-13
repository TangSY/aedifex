import { describe, expect, test } from 'bun:test'
import {
  BoxGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import {
  findStandingDestination,
  standingOriginPose,
} from './standing-destination'

function box(x: number, y: number, z: number, position = new Vector3()) {
  const mesh = new Mesh(new BoxGeometry(x, y, z), new MeshBasicMaterial())
  mesh.position.copy(position)
  return mesh
}

const query = (
  floors: Mesh[],
  obstacles: Mesh[] = [],
  fallbacks: Vector3[] = [],
) =>
  findStandingDestination({
    aimOrigin: new Vector3(0, 10, 0),
    aimDirection: new Vector3(0, -1, 0),
    floors,
    obstacles,
    fallbacks,
  })

describe('standing destination foundation', () => {
  test('rejects floor aiming through opaque geometry and rechecks moved obstacles', () => {
    const floor = box(6, 0.2, 6, new Vector3(0, -0.1, 0))
    const obstacle = box(1, 1, 1, new Vector3(2, 0.5, 0))
    expect(query([floor], [obstacle])).not.toBeNull()
    obstacle.position.x = 0
    expect(query([floor], [obstacle])).toBeNull()
    obstacle.position.y = 4
    expect(query([floor], [obstacle])).toBeNull()
  })

  test('detects fully enclosed standing volumes with and without BVHs', () => {
    const floor = box(6, 0.2, 6, new Vector3(0, -0.1, 0))
    const obstacle = box(8, 8, 8)
    obstacle.material.side = DoubleSide
    for (const withBvh of [false, true]) {
      if (withBvh) Object.defineProperty(obstacle.geometry, 'boundsTree', { value: new MeshBVH(obstacle.geometry), configurable: true })
      expect(
        findStandingDestination({
          floors: [floor],
          obstacles: [obstacle],
          aimOrigin: new Vector3(0, 3, 0),
          aimDirection: new Vector3(0, -1, 0),
        }),
      ).toBeNull()
    }
  })

  test('resolves actual upper-level and basement floor heights', () => {
    for (const height of [-3, 4]) {
      const floor = box(6, 0.2, 6, new Vector3(0, height - 0.1, 0))
      expect(query([floor])?.point.y).toBeCloseTo(height)
    }
  })

  test('does not invent a ground plane or accept hidden floors', () => {
    expect(query([])).toBeNull()
    const parent = new Group()
    const floor = box(6, 0.2, 6)
    parent.add(floor)
    parent.visible = false
    expect(query([floor])).toBeNull()
  })

  test('rejects low ceilings, occupied body space and unsupported edges', () => {
    const floor = box(6, 0.2, 6, new Vector3(0, -0.1, 0))
    expect(query([floor], [box(2, 0.2, 2, new Vector3(0, 1.6, 0))])).toBeNull()
    expect(
      query([floor], [box(0.3, 1, 0.3, new Vector3(0, 0.6, 0))]),
    ).toBeNull()
    expect(query([box(0.3, 0.2, 0.3)])).toBeNull()
  })

  test('uses only revalidated explicit fallbacks', () => {
    const floor = box(6, 0.2, 6, new Vector3(0, -0.1, 0))
    const obstacle = box(0.5, 1, 0.5, new Vector3(0, 0.5, 0))
    const result = query(
      [floor],
      [obstacle],
      [new Vector3(0, 0, 0), new Vector3(2, 0, 0)],
    )
    expect(result?.source).toBe('fallback')
    expect(result?.point.x).toBeCloseTo(2)
    expect(result?.point.y).toBeCloseTo(0)
    expect(result?.point.z).toBeCloseTo(0)
    expect(query([floor], [obstacle], [new Vector3(8, 0, 0)])).toBeNull()
  })

  test('preserves arrival heading and rotated room-scale offset at upper levels', () => {
    const point = new Vector3(4, 3, -2)
    const viewer = new Vector3(0.3, 1.65, -0.2)
    const result = standingOriginPose(point, viewer, 0.2, 1.3)
    const actualEye = viewer
      .clone()
      .applyAxisAngle(new Vector3(0, 1, 0), result.yaw)
      .add(result.position)
    expect(actualEye.x).toBeCloseTo(point.x)
    expect(actualEye.z).toBeCloseTo(point.z)
    expect(actualEye.y).toBeCloseTo(4.65)
    expect(result.yaw + 0.2).toBeCloseTo(1.3)
  })
})
