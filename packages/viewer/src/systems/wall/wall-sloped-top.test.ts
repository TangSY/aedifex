import { expect, test } from 'bun:test'
import {
  type AnyNode,
  type AnyNodeId,
  calculateLevelMiters,
  getWallChordFractionAt,
  getWallCurveFrameAt,
  getWallCurveLength,
  LevelNode,
  planWallDivision,
  resolveWallTop,
  SlabNode,
  sceneRegistry,
  WallNode,
  WindowNode,
  wallSupportForNodes,
} from '@aedifex/core'
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
import { generateExtrudedWall } from './wall-system'

test('a split wall renders its original support-relative top over another slab', () => {
  const wall = WallNode.parse({
    parentId: 'level_view-split',
    start: [0, 0],
    end: [4, 0],
    height: 2,
    endHeightOffset: 1,
    thickness: 0.2,
  })
  const level = LevelNode.parse({
    id: 'level_view-split',
    height: 3,
    children: [wall.id, 'slab_view-a', 'slab_view-b'],
  })
  const a = SlabNode.parse({
    id: 'slab_view-a',
    parentId: level.id,
    elevation: 0.4,
    polygon: [
      [-1, -1],
      [2, -1],
      [2, 1],
      [-1, 1],
    ],
  })
  const b = SlabNode.parse({
    id: 'slab_view-b',
    parentId: level.id,
    elevation: 0.05,
    polygon: [
      [2, -1],
      [5, -1],
      [5, 1],
      [2, 1],
    ],
  })
  const nodes = Object.fromEntries([wall, level, a, b].map((node) => [node.id, node])) as Record<
    AnyNodeId,
    AnyNode
  >
  const plan = planWallDivision(nodes, wall.id, 2)
  const first = {
    ...wall,
    ...plan.changes.update.find((entry) => entry.id === wall.id)!.data,
  } as WallNode
  const second = { ...plan.changes.create[0]!.node, parentId: level.id } as WallNode
  const after = { ...nodes, [first.id]: first, [second.id]: second }
  const base = wallSupportForNodes(second, after).elevation
  const geometry = generateExtrudedWall(
    second,
    [],
    calculateLevelMiters([first, second]),
    base,
    base,
    undefined,
    3,
    undefined,
    undefined,
    undefined,
    after,
  )
  const material = new MeshBasicMaterial({ side: DoubleSide })
  try {
    const mesh = new Mesh(geometry, material)
    mesh.updateMatrixWorld()
    const hits = new Raycaster(new Vector3(1, 5, 0), new Vector3(0, -1, 0)).intersectObject(mesh)
    expect((hits[0]?.point.y ?? Number.NaN) + base).toBeCloseTo(3.15, 3)
  } finally {
    geometry.dispose()
    material.dispose()
  }
})

test('curved storey-bound segment renders its transverse top plane', () => {
  const wall = WallNode.parse({
    start: [0, 0],
    end: [4, 0],
    curveOffset: 1,
    height: 2.5,
    endHeightOffset: -0.5,
    thickness: 0.2,
    topProfile: { offset: -2, from: 0.25, to: 0.5, across: 0.5 },
  })
  const geometry = generateExtrudedWall(wall, [], calculateLevelMiters([wall]), 0, 0, undefined, 3)
  const material = new MeshBasicMaterial({ side: DoubleSide })
  try {
    const mesh = new Mesh(geometry, material)
    mesh.updateMatrixWorld()
    for (const t of [0.25, 0.5, 0.75]) {
      const point = getWallCurveFrameAt(wall, t).point
      const hits = new Raycaster(
        new Vector3(point.x, 5, point.y),
        new Vector3(0, -1, 0),
      ).intersectObject(mesh)
      const fraction = getWallChordFractionAt(wall, getWallCurveLength(wall) * t)
      expect(hits[0]?.point.y).toBeCloseTo(resolveWallTop(wall, 3, 0, 3, fraction), 3)
    }
  } finally {
    geometry.dispose()
    material.dispose()
  }
})

test('a shifted top that crosses the minimum is rendered as a clipped plane', () => {
  const wall = WallNode.parse({
    start: [0, 0],
    end: [4, 0],
    thickness: 0.2,
    topProfile: { offset: -2, from: 0, to: 1, endShift: -1 },
  })
  const geometry = generateExtrudedWall(wall, [], calculateLevelMiters([wall]), 0, 0, undefined, 3)
  const material = new MeshBasicMaterial({ side: DoubleSide })
  try {
    const mesh = new Mesh(geometry, material)
    mesh.updateMatrixWorld()
    for (const x of [1, 2, 3, 3.99]) {
      const hits = new Raycaster(new Vector3(x, 5, 0), new Vector3(0, -1, 0)).intersectObject(mesh)
      expect(hits[0]?.point.y).toBeCloseTo(resolveWallTop(wall, 3, 0, 3, x / 4), 3)
    }
  } finally {
    geometry.dispose()
    material.dispose()
  }
})

test('an old opening above the lower face does not cut the higher face', () => {
  const wall = WallNode.parse({
    start: [0, 0],
    end: [4, 0],
    thickness: 0.4,
    topProfile: { offset: 0, from: 0, to: 1, acrossShift: 8 },
  })
  const opening = WindowNode.parse({
    parentId: wall.id,
    wallId: wall.id,
    position: [2, 1.8, 0],
    width: 1,
    height: 2.8,
  })
  sceneRegistry.nodes.set(wall.id, new Mesh())
  const geometry = generateExtrudedWall(
    wall,
    [opening],
    calculateLevelMiters([wall]),
    0,
    0,
    undefined,
    3,
  )
  const material = new MeshBasicMaterial({ side: DoubleSide })
  try {
    const mesh = new Mesh(geometry, material)
    mesh.updateMatrixWorld()
    const hits = new Raycaster(new Vector3(2, 2.8, 2), new Vector3(0, 0, -1)).intersectObject(mesh)
    expect(hits.length).toBeGreaterThan(0)
  } finally {
    geometry.dispose()
    material.dispose()
    sceneRegistry.nodes.delete(wall.id)
  }
})

test('a sloped wall body reaches the requested heights at both ends', () => {
  const wall = {
    ...WallNode.parse({ start: [0, 0], end: [4, 0], height: 2, thickness: 0.2 }),
    endHeightOffset: 1,
  }
  const geometry = generateExtrudedWall(wall, [], calculateLevelMiters([wall]))
  try {
    const positions = geometry.getAttribute('position')
    const topAt = (x: number) => {
      let top = Number.NEGATIVE_INFINITY
      for (let i = 0; i < positions.count; i++)
        if (Math.abs(positions.getX(i) - x) < 0.001) top = Math.max(top, positions.getY(i))
      return top
    }
    expect(topAt(0)).toBeCloseTo(2, 4)
    expect(topAt(4)).toBeCloseTo(3, 4)
  } finally {
    geometry.dispose()
  }
})

test('an acute miter clamped to minimum height keeps the intended slope inside the wall', () => {
  const wall = WallNode.parse({
    start: [0, 0],
    end: [4, 0],
    height: 0.5,
    endHeightOffset: 2,
    thickness: 0.4,
  })
  const neighbor = WallNode.parse({ start: [0, 0], end: [4, 1], height: 3, thickness: 0.4 })
  const geometry = generateExtrudedWall(wall, [], calculateLevelMiters([wall, neighbor]))
  const material = new MeshBasicMaterial({ side: DoubleSide })
  try {
    expect(geometry.getAttribute('uv').count).toBe(geometry.getAttribute('position').count)
    const mesh = new Mesh(geometry, material)
    mesh.updateMatrixWorld()
    for (const x of [0, 0.5, 1]) {
      const hits = new Raycaster(new Vector3(x, 4, -0.19), new Vector3(0, -1, 0)).intersectObject(
        mesh,
      )
      expect(hits[0]?.point.y).toBeCloseTo(0.5 + x * 0.5, 3)
    }
  } finally {
    geometry.dispose()
    material.dispose()
  }
})

test('an opening still cuts an acute sloped wall after its miter is split', () => {
  const wall = WallNode.parse({
    start: [0, 0],
    end: [4, 0],
    height: 0.5,
    endHeightOffset: 2,
    thickness: 0.4,
  })
  const neighbor = WallNode.parse({ start: [0, 0], end: [4, 1], height: 3, thickness: 0.4 })
  const window = WindowNode.parse({
    parentId: wall.id,
    wallId: wall.id,
    position: [2, 0.9, 0],
    width: 0.5,
    height: 0.5,
  })
  sceneRegistry.nodes.set(wall.id, new Mesh())
  const geometry = generateExtrudedWall(wall, [window], calculateLevelMiters([wall, neighbor]))
  const material = new MeshBasicMaterial({ side: DoubleSide })
  try {
    const mesh = new Mesh(geometry, material)
    mesh.updateMatrixWorld()
    const ray = (x: number) =>
      new Raycaster(new Vector3(x, 0.9, 2), new Vector3(0, 0, -1)).intersectObject(mesh)
    expect(ray(2)).toHaveLength(0)
    expect(ray(1)).not.toHaveLength(0)
  } finally {
    geometry.dispose()
    material.dispose()
    sceneRegistry.nodes.delete(wall.id)
  }
})

test('an old opening that reaches past a sloped top does not cut away the higher wall', () => {
  for (const descending of [false, true]) {
    const wall = WallNode.parse({
      id: 'wall_slope-cut',
      start: [0, 0],
      end: [4, 0],
      height: descending ? 3.5 : 1.5,
      endHeightOffset: descending ? -2 : 2,
      thickness: 0.2,
    })
    const opening = WindowNode.parse({
      parentId: wall.id,
      wallId: wall.id,
      position: [2, 1.5, 0],
      width: 2,
      height: 2,
    })
    sceneRegistry.nodes.set(wall.id, new Mesh())
    const geometry = generateExtrudedWall(wall, [opening], calculateLevelMiters([wall]))
    const material = new MeshBasicMaterial({ side: DoubleSide })
    try {
      const mesh = new Mesh(geometry, material)
      mesh.updateMatrixWorld()
      const ray = (y: number) =>
        new Raycaster(
          new Vector3(descending ? 1.2 : 2.8, y, 2),
          new Vector3(0, 0, -1),
        ).intersectObject(mesh).length
      expect(ray(1.5)).toBe(0)
      expect(ray(2.3)).toBeGreaterThan(0)
    } finally {
      material.dispose()
      geometry.dispose()
      sceneRegistry.nodes.delete(wall.id)
    }
  }
})
