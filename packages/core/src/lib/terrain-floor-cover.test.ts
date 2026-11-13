import { expect, test } from 'bun:test'
import {
  type AnyNode,
  type AnyNodeId,
  BuildingNode,
  LevelNode,
  SiteNode,
  SlabNode,
} from '../schema'
import { encodeTerrainField } from './terrain-codec'
import { createTerrainField } from './terrain-field'
import { terrainFloorCover } from './terrain-floor-cover'

const polygon: Array<[number, number]> = [
  [0, 0],
  [2, 0],
  [2, 2],
  [0, 2],
]

function scene(height: number, slabPatch: Record<string, unknown> = {}) {
  const field = createTerrainField({ cols: 5, rows: 5, spacing: 1, origin: [-1, -1] })
  const nodes: AnyNode[] = [
    SiteNode.parse({
      id: 'site_a',
      children: ['building_a'],
      terrain: encodeTerrainField({
        ...field,
        heights: new Int16Array(field.heights.length).fill(height),
      }),
    }),
    BuildingNode.parse({
      id: 'building_a',
      parentId: 'site_a',
      children: ['level_a'],
      position: [3, 0, 0],
    }),
    LevelNode.parse({ id: 'level_a', parentId: 'building_a', children: ['slab_a'] }),
    SlabNode.parse({ id: 'slab_a', parentId: 'level_a', polygon, elevation: 0.05, ...slabPatch }),
  ]
  return Object.fromEntries(nodes.map((node) => [node.id, node])) as Record<AnyNodeId, AnyNode>
}

test('cuts terrain slightly above a translated floor even inside the grade-standing tolerance', () => {
  const cover = terrainFloorCover(scene(15))
  expect(cover).toHaveLength(1)
  const x = cover[0]!.map((point) => point[0])
  expect([Math.min(...x), Math.max(...x)]).toEqual([3, 5])
  expect(terrainFloorCover(scene(5))).toEqual([])
})

test('hidden floors, recessed slabs and site flatwork do not cut terrain', () => {
  for (const patch of [{ visible: false }, { recessed: true }, { metadata: { flatwork: 'lawn' } }])
    expect(terrainFloorCover(scene(15, patch))).toEqual([])
  const nodes = scene(15)
  nodes.level_a = { ...nodes.level_a, visible: false } as AnyNode
  expect(terrainFloorCover(nodes)).toEqual([])
  const hiddenBuilding = scene(15)
  hiddenBuilding.building_a = { ...hiddenBuilding.building_a, visible: false } as AnyNode
  expect(terrainFloorCover(hiddenBuilding)).toEqual([])
})

test('a site receives only floors belonging to it', () => {
  const nodes = scene(15)
  nodes.site_b = SiteNode.parse({ id: 'site_b', children: [] })
  expect(terrainFloorCover(nodes, 'site_a')).toHaveLength(1)
  expect(terrainFloorCover(nodes, 'site_b')).toEqual([])
})
