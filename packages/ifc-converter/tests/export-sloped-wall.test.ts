import { beforeAll, expect, test } from 'bun:test'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  type AnyNode,
  type AnyNodeId,
  LevelNode,
  planWallDivision,
  SlabNode,
  WallNode,
  WindowNode,
} from '@aedifex/core'
import * as WebIFC from 'web-ifc'
import { buildIfcExport } from '../src/export'
import { expectWellFormedStep } from './export-step-check'

const api = new WebIFC.IfcAPI()
beforeAll(async () => {
  api.SetWasmPath(`${dirname(fileURLToPath(import.meta.resolve('web-ifc')))}/`, true)
  await api.Init()
})

function wallMesh(nodes: Record<string, AnyNode>) {
  const { ifc } = buildIfcExport({ nodes, timestamp: new Date(0) })
  expectWellFormedStep(ifc)
  expect(ifc).toContain("'Body','Clipping'")
  const model = api.OpenModel(new TextEncoder().encode(ifc))
  try {
    const wallId = api.GetLineIDsWithType(model, WebIFC.IFCWALL).get(0)
    const flat = api.GetFlatMesh(model, wallId)
    const vertices: number[][] = []
    let volume = 0
    for (let g = 0; g < flat.geometries.size(); g++) {
      const part = flat.geometries.get(g)
      const matrix = part.flatTransformation
      const geometry = api.GetGeometry(model, part.geometryExpressID)
      const data = api.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize())
      const indices = api.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize())
      const local: number[][] = []
      for (let i = 0; i + 5 < data.length; i += 6) {
        const [x, y, z] = [data[i]!, data[i + 1]!, data[i + 2]!]
        const wx = matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!
        const wy = matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!
        const wz = matrix[2]! * x + matrix[6]! * y + matrix[10]! * z + matrix[14]!
        local.push([wx, -wz, wy])
      }
      vertices.push(...local)
      for (let i = 0; i + 2 < indices.length; i += 3) {
        const a = local[indices[i]!]!,
          b = local[indices[i + 1]!]!,
          c = local[indices[i + 2]!]!
        volume +=
          (a[0]! * (b[1]! * c[2]! - b[2]! * c[1]!) -
            a[1]! * (b[0]! * c[2]! - b[2]! * c[0]!) +
            a[2]! * (b[0]! * c[1]! - b[1]! * c[0]!)) /
          6
      }
    }
    return { vertices, volume: Math.abs(volume) }
  } finally {
    api.CloseModel(model)
  }
}

test('IFC retains a transverse wall-top slope on both faces', () => {
  const wall = WallNode.parse({
    id: 'wall_ifc-transverse',
    parentId: 'level_ifc-transverse',
    start: [0, 0],
    end: [4, 0],
    thickness: 0.2,
    height: 2.5,
    endHeightOffset: -0.5,
    topProfile: { offset: -2, from: 0.25, to: 0.5, across: 0.5 },
  })
  const level = LevelNode.parse({ id: wall.parentId, height: 3, children: [wall.id] })
  const { vertices } = wallMesh({ [level.id]: level, [wall.id]: wall })
  for (const z of [-0.1, 0.1]) {
    const top = Math.max(
      ...vertices
        .filter((v) => Math.abs(v[0]!) < 0.001 && Math.abs(v[1]! - z) < 0.001)
        .map((v) => v[2]!),
    )
    expect(top).toBeCloseTo(2.5 + 0.25 * z, 3)
  }
})

test('IFC keeps the original support-relative top of a split wall over a different slab', () => {
  const wall = WallNode.parse({
    parentId: 'level_ifc-split',
    start: [0, 0],
    end: [4, 0],
    height: 2,
    endHeightOffset: 1,
    thickness: 0.2,
  })
  const level = LevelNode.parse({
    id: 'level_ifc-split',
    height: 3,
    children: [wall.id, 'slab_ifc-a', 'slab_ifc-b'],
  })
  const a = SlabNode.parse({
    id: 'slab_ifc-a',
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
    id: 'slab_ifc-b',
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
  const second = { ...plan.changes.create[0]!.node, parentId: level.id } as WallNode
  const { vertices } = wallMesh({ [level.id]: level, [a.id]: a, [b.id]: b, [second.id]: second })
  for (const [x, expected] of [
    [2, 2.9],
    [4, 3.4],
  ] as const) {
    const top = Math.max(...vertices.filter((v) => Math.abs(v[0]! - x) < 0.001).map((v) => v[2]!))
    expect(top).toBeCloseTo(expected, 3)
  }
})

test('IFC preserves the minimum-height clamp of a transverse plane', () => {
  const wall = WallNode.parse({
    id: 'wall_ifc-transverse-clamp',
    parentId: 'level_ifc-transverse-clamp',
    start: [0, 0],
    end: [4, 0],
    thickness: 0.2,
    topProfile: { offset: -2, from: 0, to: 1, across: 1, endShift: -1 },
  })
  const level = LevelNode.parse({ id: wall.parentId, height: 3, children: [wall.id] })
  const { vertices } = wallMesh({ [level.id]: level, [wall.id]: wall })
  const upper = vertices.filter((v) => v[2]! > 0.005)
  expect(upper.length).toBeGreaterThan(3)
  for (const [x, y, z] of upper) expect(z!).toBeCloseTo(Math.max(0.01, 3 - 0.75 * x! + 0.5 * y!), 3)
})

test('IFC clips an old opening to the lower wall face', () => {
  const wall = WallNode.parse({
    id: 'wall_ifc-old-opening',
    parentId: 'level_ifc-old-opening',
    start: [0, 0],
    end: [4, 0],
    thickness: 0.4,
    topProfile: { offset: 0, from: 0, to: 1, acrossShift: 8 },
    children: ['window_ifc-old-opening'],
  })
  const opening = WindowNode.parse({
    id: 'window_ifc-old-opening',
    parentId: wall.id,
    wallId: wall.id,
    position: [2, 1.8, 0],
    width: 1,
    height: 2.8,
  })
  const level = LevelNode.parse({ id: wall.parentId, height: 3, children: [wall.id] })
  const { volume } = wallMesh({ [level.id]: level, [wall.id]: wall, [opening.id]: opening })
  expect(volume).toBeCloseTo(3.92, 2)
})

test('IFC preserves both sloped top heights and an opening', () => {
  for (const descending of [false, true]) {
    const wall = WallNode.parse({
      id: 'wall_ifc-slope',
      parentId: 'level_ifc-slope',
      start: [0, 0],
      end: [4, 0],
      thickness: 0.2,
      height: descending ? 3 : 2,
      endHeightOffset: descending ? -1 : 1,
      children: ['window_ifc-slope'],
    })
    const window = WindowNode.parse({
      id: 'window_ifc-slope',
      parentId: wall.id,
      wallId: wall.id,
      position: [2, 1, 0],
      width: 1,
      height: 1,
    })
    const level = LevelNode.parse({ id: 'level_ifc-slope', height: 4, children: [wall.id] })
    const nodes = Object.fromEntries([level, wall, window].map((n) => [n.id, n])) as Record<
      string,
      AnyNode
    >
    const { vertices, volume } = wallMesh(nodes)
    const topAt = (x: number) =>
      Math.max(...vertices.filter((v) => Math.abs(v[0]! - x) < 0.05).map((v) => v[2]!))
    expect(topAt(0)).toBeCloseTo(descending ? 3 : 2, 2)
    expect(topAt(4)).toBeCloseTo(descending ? 2 : 3, 2)
    expect(volume).toBeCloseTo(1.8, 2)
  }
})

test('IFC sloped wall retains its stepped floor supports', () => {
  const wall = WallNode.parse({
    id: 'wall_ifc-slope',
    parentId: 'level_ifc-slope',
    start: [0, 0],
    end: [4, 0],
    thickness: 0.2,
    height: 2.5,
    endHeightOffset: 1,
  })
  const level = LevelNode.parse({
    id: 'level_ifc-slope',
    height: 4,
    children: [wall.id, 'slab_upper', 'slab_lower'],
  })
  const upper = SlabNode.parse({
    id: 'slab_upper',
    parentId: level.id,
    polygon: [
      [-1, -1],
      [2, -1],
      [2, 1],
      [-1, 1],
    ],
    elevation: 0.4,
    thickness: 0.4,
  })
  const lower = SlabNode.parse({
    id: 'slab_lower',
    parentId: level.id,
    polygon: [
      [2, -1],
      [5, -1],
      [5, 1],
      [2, 1],
    ],
    elevation: 0.05,
    thickness: 0.05,
  })
  const nodes = Object.fromEntries([level, wall, upper, lower].map((n) => [n.id, n])) as Record<
    string,
    AnyNode
  >
  const { vertices, volume } = wallMesh(nodes)
  expect(Math.min(...vertices.filter((v) => v[0]! < 1.9).map((v) => v[2]!))).toBeCloseTo(0.4, 3)
  expect(Math.min(...vertices.filter((v) => v[0]! > 2.1).map((v) => v[2]!))).toBeCloseTo(0.05, 3)
  expect(volume).toBeCloseTo(2.54, 2)
})

test('IFC preserves the sloped top on a curved wall', () => {
  for (const curveOffset of [-0.8, 0.8]) {
    const wall = WallNode.parse({
      id: 'wall_ifc-arc-slope',
      parentId: 'level_ifc-arc-slope',
      start: [0, 0],
      end: [4, 0],
      thickness: 0.2,
      height: 2,
      endHeightOffset: 1,
      curveOffset,
    })
    const level = LevelNode.parse({ id: 'level_ifc-arc-slope', height: 4, children: [wall.id] })
    const { vertices, volume } = wallMesh({ [level.id]: level, [wall.id]: wall })
    expect(vertices.length).toBeGreaterThan(0)
    const topAt = (x: number) =>
      Math.max(...vertices.filter((v) => Math.abs(v[0]! - x) < 0.15).map((v) => v[2]!))
    expect(topAt(0)).toBeCloseTo(2, 1)
    expect(topAt(4)).toBeCloseTo(3, 1)
    expect(volume).toBeGreaterThan(1.5)
  }
})

test('IFC preserves an acute mitre below the slope height clamp', () => {
  const wall = WallNode.parse({
    id: 'wall_ifc-miter',
    parentId: 'level_ifc-miter',
    start: [0, 0],
    end: [4, 0],
    height: 0.5,
    endHeightOffset: 2,
    thickness: 0.4,
  })
  const neighbor = WallNode.parse({
    id: 'wall_ifc-neighbor',
    parentId: wall.parentId,
    start: [0, 0],
    end: [4, 1],
    height: 3,
    thickness: 0.4,
  })
  const level = LevelNode.parse({ id: wall.parentId, height: 4, children: [wall.id, neighbor.id] })
  const { vertices } = wallMesh({ [level.id]: level, [wall.id]: wall, [neighbor.id]: neighbor })
  const minX = Math.min(...vertices.map((v) => v[0]!))
  const endVertices = vertices.filter((v) => Math.abs(v[0]! - minX) < 0.01)
  expect(minX).toBeLessThan(-1.5)
  expect(Math.max(...endVertices.map((v) => v[2]!))).toBeCloseTo(0.01, 2)
})

test('IFC extends a sloped top across a high-end mitre', () => {
  for (const descending of [false, true]) {
    const wall = WallNode.parse({
      id: 'wall_ifc-miter',
      parentId: 'level_ifc-miter',
      start: [0, 0],
      end: [4, 0],
      height: descending ? 3 : 2,
      endHeightOffset: descending ? -1 : 1,
      thickness: 0.4,
    })
    const at = descending ? [0, 0] : [4, 0]
    const to = descending ? [4, 1] : [0, 1]
    const neighbor = WallNode.parse({
      id: 'wall_ifc-neighbor',
      parentId: wall.parentId,
      start: at,
      end: to,
      height: 3,
      thickness: 0.4,
    })
    const level = LevelNode.parse({
      id: wall.parentId,
      height: 4,
      children: [wall.id, neighbor.id],
    })
    const { vertices } = wallMesh({ [level.id]: level, [wall.id]: wall, [neighbor.id]: neighbor })
    const extreme = descending
      ? Math.min(...vertices.map((v) => v[0]!))
      : Math.max(...vertices.map((v) => v[0]!))
    expect(descending ? extreme : -extreme).toBeLessThan(descending ? -0.5 : -4.5)
    const top = Math.max(
      ...vertices.filter((v) => Math.abs(v[0]! - extreme) < 0.01).map((v) => v[2]!),
    )
    expect(top).toBeCloseTo((descending ? 3 : 2) + (descending ? -0.25 : 0.25) * extreme, 2)
  }
})

test('IFC retains an acute mitre when a sloped wall spans stepped supports', () => {
  const wall = WallNode.parse({
    id: 'wall_ifc-miter',
    parentId: 'level_ifc-miter',
    start: [0, 0],
    end: [4, 0],
    height: 0.5,
    endHeightOffset: 2,
    thickness: 0.4,
  })
  const neighbor = WallNode.parse({
    id: 'wall_ifc-neighbor',
    parentId: wall.parentId,
    start: [0, 0],
    end: [4, 1],
    height: 3,
    thickness: 0.4,
  })
  const upper = SlabNode.parse({
    id: 'slab_ifc-upper',
    parentId: wall.parentId,
    polygon: [
      [-3, -1],
      [2, -1],
      [2, 1],
      [-3, 1],
    ],
    elevation: 0.4,
    thickness: 0.4,
  })
  const lower = SlabNode.parse({
    id: 'slab_ifc-lower',
    parentId: wall.parentId,
    polygon: [
      [2, -1],
      [5, -1],
      [5, 1],
      [2, 1],
    ],
    elevation: 0.05,
    thickness: 0.05,
  })
  const level = LevelNode.parse({
    id: wall.parentId,
    height: 4,
    children: [wall.id, neighbor.id, upper.id, lower.id],
  })
  const nodes = Object.fromEntries([level, wall, neighbor, upper, lower].map((n) => [n.id, n]))
  const { vertices } = wallMesh(nodes)
  expect(Math.min(...vertices.map((v) => v[0]!))).toBeLessThan(-1.5)
})
