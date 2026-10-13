import { expect, test } from 'bun:test'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
import { xrPlacementSurfaceHit } from './roof-placement-hit'

function fixture() {
  const scene = new Group()
  const roof = new Group()
  const geometry = new BoxGeometry(4, 0.2, 4)
  const material = new MeshBasicMaterial()
  roof.add(new Mesh(geometry, material))
  scene.add(roof)
  const registered = new Map([[roof, { type: 'roof' }]])
  const ray = new Raycaster(new Vector3(0, 5, 0), new Vector3(0, -1, 0))
  return { scene, roof, geometry, material, registered, ray }
}

test('roof hit stays under the ray in a translated, rotated and scaled god-mode scene', () => {
  const { scene, roof, geometry, material, registered, ray } = fixture()
  try {
    scene.position.set(4, 2, -3)
    scene.rotation.y = 0.7
    scene.scale.setScalar(0.2)
    scene.updateWorldMatrix(true, true)
    const expected = roof.localToWorld(new Vector3(0.4, 0.1, -0.3))
    ray.ray.origin.copy(expected).add(new Vector3(0, 3, 0))
    const result = xrPlacementSurfaceHit(scene, ray, registered)
    expect(result?.node.type).toBe('roof')
    expect(result!.hit.point.distanceTo(expected)).toBeLessThan(1e-7)
    expect(ray.ray.distanceToPoint(result!.hit.point)).toBeLessThan(1e-8)
  } finally {
    geometry.dispose()
    material.dispose()
  }
})

test('hidden geometry is ignored and an opaque obstruction is not treated as a roof', () => {
  const { scene, roof, geometry, material, registered, ray } = fixture()
  try {
    const wall = new Group()
    wall.position.y = 2
    wall.add(new Mesh(geometry, material))
    scene.add(wall)
    registered.set(wall, { type: 'wall' })
    expect(xrPlacementSurfaceHit(scene, ray, registered)?.node.type).toBe('wall')
    wall.visible = false
    expect(xrPlacementSurfaceHit(scene, ray, registered)?.node.type).toBe('roof')
    roof.visible = false
    expect(xrPlacementSurfaceHit(scene, ray, registered)).toBeNull()
  } finally {
    geometry.dispose()
    material.dispose()
  }
})

test('painted roof segments resolve to their roof, while accessories keep their own target type', () => {
  const { scene, roof, geometry, material, registered, ray } = fixture()
  try {
    const segment = new Group()
    segment.add(roof.children[0]!)
    roof.add(segment)
    registered.set(segment, { type: 'roof-segment' })
    expect(xrPlacementSurfaceHit(scene, ray, registered)?.node.type).toBe('roof')
    registered.set(segment, { type: 'chimney' })
    expect(xrPlacementSurfaceHit(scene, ray, registered)?.node.type).toBe('chimney')
  } finally {
    geometry.dispose()
    material.dispose()
  }
})
