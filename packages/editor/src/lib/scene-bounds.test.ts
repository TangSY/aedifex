import { describe, expect, test } from 'bun:test'
import type { AnyNode } from '@aedifex/core/schema'
import { computeSceneBoundsXZ } from './scene-bounds'

function makeWall(start: [number, number], end: [number, number]): AnyNode {
  return {
    object: 'node',
    id: `wall_${start.join('_')}_${end.join('_')}`,
    type: 'wall',
    parentId: null,
    visible: true,
    metadata: {},
    children: [],
    start,
    end,
    frontSide: 'unknown',
    backSide: 'unknown',
  } as unknown as AnyNode
}

function makeZone(polygon: [number, number][]): AnyNode {
  return {
    object: 'node',
    id: `zone_${polygon.length}_${polygon[0]?.[0] ?? 0}`,
    type: 'zone',
    parentId: null,
    visible: true,
    metadata: {},
    name: 'Zone',
    polygon,
    color: '#000000',
  } as unknown as AnyNode
}

function makeSite(points: [number, number][]): AnyNode {
  return {
    object: 'node',
    id: 'site_test',
    type: 'site',
    parentId: null,
    visible: true,
    metadata: {},
    polygon: { type: 'polygon', points },
    children: [],
  } as unknown as AnyNode
}

describe('computeSceneBoundsXZ', () => {
  test('uses world coordinates for a rotated building and excludes wall-local openings', () => {
    const building = {
      id: 'building_test',
      type: 'building',
      parentId: null,
      position: [100, 0, 100],
      rotation: [0, Math.PI / 2, 0],
    } as unknown as AnyNode
    const level = { id: 'level_test', type: 'level', parentId: building.id } as AnyNode
    const wall = { ...makeWall([0, 0], [8, 0]), parentId: level.id } as AnyNode
    const door = {
      id: 'door_test',
      type: 'door',
      parentId: wall.id,
      position: [2, 1, 0],
    } as unknown as AnyNode
    const bounds = computeSceneBoundsXZ([building, level, wall, door])!
    expect(bounds.min[0]).toBeCloseTo(100)
    expect(bounds.max[0]).toBeCloseTo(100)
    expect(bounds.min[1]).toBeCloseTo(92)
    expect(bounds.max[1]).toBeCloseTo(100)
  })

  test('composes nested rotations and translations', () => {
    const building = {
      id: 'building_test',
      type: 'building',
      parentId: null,
      position: [50, 0, 50],
      rotation: [0, Math.PI / 2, 0],
    } as unknown as AnyNode
    const host = {
      id: 'item_host',
      type: 'item',
      parentId: building.id,
      position: [2, 0, 0],
      rotation: [0, Math.PI / 2, 0],
    } as unknown as AnyNode
    const child = {
      id: 'item_child',
      type: 'item',
      parentId: host.id,
      position: [1, 0, 0],
    } as unknown as AnyNode
    const bounds = computeSceneBoundsXZ([building, host, child])!
    expect(bounds.min[0]).toBeCloseTo(49)
    expect(bounds.min[1]).toBeCloseTo(48)
    expect(bounds.max[0]).toBeCloseTo(50)
    expect(bounds.max[1]).toBeCloseTo(50)
  })

  test('terminates on a malformed parent cycle', () => {
    const a = {
      id: 'item_a',
      type: 'item',
      parentId: 'item_b',
      position: [1, 0, 0],
    } as unknown as AnyNode
    const b = {
      id: 'item_b',
      type: 'item',
      parentId: 'item_a',
      position: [0, 0, 1],
    } as unknown as AnyNode
    const bounds = computeSceneBoundsXZ([a, b])!
    expect(bounds.center.every(Number.isFinite)).toBe(true)
  })

  test('handles malformed persisted rotations without crashing the scene load', () => {
    const malformed = JSON.parse('{"toString":null,"valueOf":null}')
    const building = {
      id: 'building_bad',
      type: 'building',
      parentId: null,
      position: [10, 0, 20],
      rotation: [0, malformed, 0],
    } as unknown as AnyNode
    const wall = { ...makeWall([0, 0], [4, 0]), parentId: building.id } as AnyNode
    expect(computeSceneBoundsXZ([building, wall])?.center[0]).toBeCloseTo(12)
  })

  test('handles deeply nested scene graphs without exhausting the call stack', () => {
    const nodes: AnyNode[] = []
    for (let i = 0; i < 15_000; i++) {
      nodes.push({ id: `item_${i}`, type: 'item', parentId: i ? `item_${i - 1}` : null } as AnyNode)
    }
    nodes.reverse()
    expect(computeSceneBoundsXZ(nodes)).toBeNull()
  })

  test('returns null when given an empty array', () => {
    expect(computeSceneBoundsXZ([])).toBeNull()
  })

  test('returns null when no geometry is found on any node', () => {
    const barren = [
      {
        object: 'node',
        id: 'building_1',
        type: 'building',
        parentId: null,
        visible: true,
        metadata: {},
        children: [],
      } as unknown as AnyNode,
    ]
    expect(computeSceneBoundsXZ(barren)).toBeNull()
  })

  test('computes bounds from wall endpoints', () => {
    const nodes: AnyNode[] = [makeWall([0, 0], [4, 0]), makeWall([4, 0], [4, 3])]
    const bounds = computeSceneBoundsXZ(nodes)
    expect(bounds).not.toBeNull()
    expect(bounds!.min).toEqual([0, 0])
    expect(bounds!.max).toEqual([4, 3])
    expect(bounds!.size).toEqual([4, 3])
    expect(bounds!.center).toEqual([2, 1.5])
  })

  test('includes zone polygons', () => {
    const nodes: AnyNode[] = [
      makeZone([
        [-10, -5],
        [10, -5],
        [10, 5],
        [-10, 5],
      ]),
    ]
    const bounds = computeSceneBoundsXZ(nodes)
    expect(bounds).not.toBeNull()
    expect(bounds!.min).toEqual([-10, -5])
    expect(bounds!.max).toEqual([10, 5])
    expect(bounds!.size).toEqual([20, 10])
  })

  test('ignores the default 30×30 site bootstrap polygon', () => {
    const nodes: AnyNode[] = [
      makeSite([
        [-15, -15],
        [15, -15],
        [15, 15],
        [-15, 15],
      ]),
      makeWall([1, 1], [2, 2]),
    ]
    const bounds = computeSceneBoundsXZ(nodes)
    expect(bounds).not.toBeNull()
    // Only the wall should count — the default site polygon is skipped.
    expect(bounds!.min).toEqual([1, 1])
    expect(bounds!.max).toEqual([2, 2])
  })

  test('honours a non-default site polygon', () => {
    const nodes: AnyNode[] = [
      makeSite([
        [-25, -20],
        [25, -20],
        [25, 20],
        [-25, 20],
      ]),
    ]
    const bounds = computeSceneBoundsXZ(nodes)
    expect(bounds).not.toBeNull()
    expect(bounds!.min).toEqual([-25, -20])
    expect(bounds!.max).toEqual([25, 20])
  })

  test('combines walls, zones and positions across the flat dict', () => {
    const nodes: Record<string, AnyNode> = {
      wallA: makeWall([-8, -3], [4, -3]),
      wallB: makeWall([4, -3], [4, 6]),
      zoneA: makeZone([
        [-8, -3],
        [4, -3],
        [4, 6],
        [-8, 6],
      ]),
      item1: {
        object: 'node',
        id: 'item_1',
        type: 'item',
        parentId: null,
        visible: true,
        metadata: {},
        position: [7, 0, 8],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        children: [],
        asset: {
          id: 'a',
          category: 'furniture',
          name: 'Chair',
          thumbnail: '',
          src: '',
          dimensions: [1, 1, 1],
          offset: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
      } as unknown as AnyNode,
    }
    const bounds = computeSceneBoundsXZ(nodes)
    expect(bounds).not.toBeNull()
    expect(bounds!.min).toEqual([-8, -3])
    expect(bounds!.max).toEqual([7, 8])
  })

  test('handles a single degenerate point with a minimum extent', () => {
    const nodes: AnyNode[] = [makeWall([2, 2], [2, 2])]
    const bounds = computeSceneBoundsXZ(nodes)
    expect(bounds).not.toBeNull()
    expect(bounds!.size[0]).toBeGreaterThan(0)
    expect(bounds!.size[1]).toBeGreaterThan(0)
    expect(bounds!.center).toEqual([2, 2])
  })

  test('skips non-finite coordinates', () => {
    const nodes: AnyNode[] = [makeWall([Number.NaN, 0], [4, 2]), makeWall([0, 0], [1, 1])]
    const bounds = computeSceneBoundsXZ(nodes)
    expect(bounds).not.toBeNull()
    // NaN should be ignored; the usable points are (4,2), (0,0), (1,1).
    expect(bounds!.min).toEqual([0, 0])
    expect(bounds!.max).toEqual([4, 2])
  })
})
