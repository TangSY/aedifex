import { describe, expect, test } from 'bun:test'
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Vector3,
} from 'three'
import { collectStandingScene } from './standing-scene'
import { findStandingDestination } from '../../xr/mode-switching/lib/standing-destination'

describe('editor standing scene adapter', () => {
  test('bare editor site ground is a valid entry floor without adding a slab', () => {
    const root = new Group()
    const site = new Group()
    const ground = new Mesh(new PlaneGeometry(30, 30), new MeshBasicMaterial())
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.05
    site.add(ground)
    root.add(site)
    const scene = collectStandingScene(
      root,
      { site: { type: 'site' } },
      new Map([['site', site]]),
    )
    expect(
      findStandingDestination({
        ...scene,
        aimOrigin: new Vector3(0, 4, 0),
        aimDirection: new Vector3(0, -1, 0),
      }),
    ).not.toBeNull()
    ground.userData.aedifexExport = 'strip'
    expect(
      collectStandingScene(
        root,
        { site: { type: 'site' } },
        new Map([['site', site]]),
      ).floors,
    ).toHaveLength(0)
  })
  test('queries floors at life size without changing the God transform', () => {
    const root = new Group()
    root.position.set(3, 2, -5)
    root.rotation.y = 0.8
    root.scale.setScalar(0.08)
    const slab = new Group()
    slab.position.y = 3
    const mesh = new Mesh(new BoxGeometry(5, 0.2, 5), new MeshBasicMaterial())
    mesh.position.y = -0.1
    mesh.layers.set(5)
    slab.add(mesh)
    root.add(slab)
    const scene = collectStandingScene(
      root,
      { slab: { type: 'slab' } },
      new Map([['slab', slab]]),
    )
    const result = findStandingDestination({
      ...scene,
      aimOrigin: new Vector3(0, 8, 0),
      aimDirection: new Vector3(0, -1, 0),
    })
    expect(result?.point.y).toBeCloseTo(3)
    expect(root.scale.x).toBe(0.08)
    expect(root.position.toArray()).toEqual([3, 2, -5])
    expect(scene.floors[0]!.geometry).toBe(mesh.geometry)
    expect(mesh.parent).toBe(slab)
  })

  test('classifies terrain and floors, excludes roofs as destinations and keeps overhead obstacles', () => {
    const root = new Group()
    const registry = new Map<string, Group>()
    const nodes: Record<string, { type: string }> = {}
    for (const type of ['slab', 'terrain', 'roof', 'item', 'spawn', 'zone']) {
      const group = new Group()
      group.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()))
      root.add(group)
      registry.set(type, group)
      nodes[type] = { type }
    }
    const scene = collectStandingScene(root, nodes, registry)
    expect(scene.floors).toHaveLength(2)
    expect(scene.obstacles).toHaveLength(4)
    expect(scene.fallbacks).toHaveLength(1)
    registry.get('terrain')!.visible = false
    root.remove(registry.get('slab')!)
    expect(collectStandingScene(root, nodes, registry).floors).toHaveLength(0)
  })

  test('resolves spawn under level transforms and ignores hidden markers', () => {
    const root = new Group()
    const level = new Group()
    level.position.y = 4
    const spawn = new Group()
    spawn.position.set(2, 0, -3)
    level.add(spawn)
    root.add(level)
    const nodes = { level: { type: 'level' }, spawn: { type: 'spawn' } }
    const registry = new Map([
      ['level', level],
      ['spawn', spawn],
    ])
    expect(
      collectStandingScene(root, nodes, registry).fallbacks[0]!.toArray(),
    ).toEqual([2, 4, -3])
    level.visible = false
    expect(collectStandingScene(root, nodes, registry).fallbacks).toHaveLength(
      0,
    )
  })
})
