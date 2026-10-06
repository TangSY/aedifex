import { describe, expect, test } from 'bun:test'
import { SlabNode, WallNode } from '../../schema'
import { resolveWallBaseElevation } from './wall-base'

const footprint: Array<[number, number]> = [
  [-1, -1],
  [5, -1],
  [5, 1],
  [-1, 1],
]

describe('resolveWallBaseElevation', () => {
  test('adds supportOffset to the elected slab elevation', () => {
    const slab = SlabNode.parse({ id: 'slab_support', polygon: footprint, elevation: 0.5 })
    const wall = WallNode.parse({
      start: [0, 0],
      end: [4, 0],
      supportSlabId: slab.id,
      supportOffset: 1,
    })

    expect(resolveWallBaseElevation({ wall, slabs: [slab], walls: [wall] })).toBe(1.5)
  })

  test('keeps a ground-hosted wall on the level base despite an overlapping slab', () => {
    const slab = SlabNode.parse({ id: 'slab_deck', polygon: footprint, elevation: 2 })
    const wall = WallNode.parse({
      start: [0, 0],
      end: [4, 0],
      supportSlabId: 'ground',
      supportOffset: 0.25,
    })

    expect(
      resolveWallBaseElevation({ wall, slabs: [slab], walls: [wall], levelBase: 0.4 }),
    ).toBeCloseTo(0.65)
  })
})
