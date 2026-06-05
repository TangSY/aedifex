import { describe, expect, test } from 'bun:test'
import { SpatialGrid } from './spatial-grid'

// Spatial broad-phase + narrow-phase AABB grid for floor items.
// Items merely touching at an edge should be allowed (EPSILON=1e-4 tolerance);
// only true overlap should conflict.
describe('SpatialGrid - canPlace EPSILON tolerance', () => {
  test('non-overlapping items in separate cells: valid', () => {
    const grid = new SpatialGrid({ cellSize: 0.5 })
    grid.insert('a', [0, 0, 0], [1, 1, 1], [0, 0, 0])

    const result = grid.canPlace([5, 0, 5], [1, 1, 1], [0, 0, 0])
    expect(result.valid).toBe(true)
    expect(result.conflictIds).toEqual([])
  })

  test('items touching exactly at edge (shared boundary) pass narrow-phase as valid', () => {
    const grid = new SpatialGrid({ cellSize: 0.5 })
    // First item: x in [0, 1], z in [0, 1]
    grid.insert('a', [0.5, 0, 0.5], [1, 1, 1], [0, 0, 0])

    // Second item: x in [1, 2], z in [0, 1] — touches first at x=1 line
    const result = grid.canPlace([1.5, 0, 0.5], [1, 1, 1], [0, 0, 0])
    expect(result.valid).toBe(true)
    expect(result.conflictIds).toEqual([])
  })

  test('items overlapping by > EPSILON conflict', () => {
    const grid = new SpatialGrid({ cellSize: 0.5 })
    grid.insert('a', [0.5, 0, 0.5], [1, 1, 1], [0, 0, 0])

    // Overlap by 0.5m
    const result = grid.canPlace([0.99, 0, 0.5], [1, 1, 1], [0, 0, 0])
    expect(result.valid).toBe(false)
    expect(result.conflictIds).toContain('a')
  })

  test('overlap less than EPSILON (1e-5) is still allowed (treated as touching)', () => {
    const grid = new SpatialGrid({ cellSize: 0.5 })
    grid.insert('a', [0.5, 0, 0.5], [1, 1, 1], [0, 0, 0]) // x in [0,1]
    // Place so they overlap by 1e-5 (below EPSILON of 1e-4)
    const result = grid.canPlace([1.5 - 1e-5, 0, 0.5], [1, 1, 1], [0, 0, 0])
    expect(result.valid).toBe(true)
  })

  test('ignoreIds skips self-conflict during update validation', () => {
    const grid = new SpatialGrid({ cellSize: 0.5 })
    grid.insert('a', [0.5, 0, 0.5], [1, 1, 1], [0, 0, 0])

    // Re-test same item's position; without ignoreIds it conflicts with itself
    const conflict = grid.canPlace([0.5, 0, 0.5], [1, 1, 1], [0, 0, 0])
    expect(conflict.valid).toBe(false)

    const ignored = grid.canPlace([0.5, 0, 0.5], [1, 1, 1], [0, 0, 0], ['a'])
    expect(ignored.valid).toBe(true)
  })

  test('rotated item AABB grows: square rotated 45° has larger axis-aligned bounds', () => {
    const grid = new SpatialGrid({ cellSize: 0.5 })
    grid.insert('a', [0, 0, 0], [1, 1, 1], [0, 0, 0]) // axis-aligned 1x1

    // Rotated 45° (~0.785 rad), AABB is sqrt(2) ~ 1.414 wide. Centered at [1, 0, 0]
    // the rotated bounds would be x in [~0.293, ~1.707], overlapping the first.
    const rot45 = Math.PI / 4
    const result = grid.canPlace([1, 0, 0], [1, 1, 1], [0, rot45, 0])
    expect(result.valid).toBe(false)
  })
})

describe('SpatialGrid - insert/remove/update bookkeeping', () => {
  test('getItemCount tracks inserts and removes', () => {
    const grid = new SpatialGrid({ cellSize: 0.5 })
    expect(grid.getItemCount()).toBe(0)

    grid.insert('a', [0, 0, 0], [1, 1, 1], [0, 0, 0])
    grid.insert('b', [5, 0, 5], [1, 1, 1], [0, 0, 0])
    expect(grid.getItemCount()).toBe(2)

    grid.remove('a')
    expect(grid.getItemCount()).toBe(1)
  })

  test('remove on unknown id is safe no-op', () => {
    const grid = new SpatialGrid({ cellSize: 0.5 })
    grid.remove('missing') // shouldn't throw
    expect(grid.getItemCount()).toBe(0)
  })

  test('update relocates an item out of its old cells', () => {
    const grid = new SpatialGrid({ cellSize: 0.5 })
    grid.insert('a', [0, 0, 0], [1, 1, 1], [0, 0, 0])
    // Move far away
    grid.update('a', [50, 0, 50], [1, 1, 1], [0, 0, 0])

    // Old location should be free now
    const old = grid.canPlace([0, 0, 0], [1, 1, 1], [0, 0, 0])
    expect(old.valid).toBe(true)

    // New location should conflict (when not ignored)
    const newLoc = grid.canPlace([50, 0, 50], [1, 1, 1], [0, 0, 0])
    expect(newLoc.valid).toBe(false)
    expect(newLoc.conflictIds).toContain('a')
  })

  test('queryRadius finds items within cell distance', () => {
    const grid = new SpatialGrid({ cellSize: 0.5 })
    grid.insert('near', [0.5, 0, 0.5], [0.5, 1, 0.5], [0, 0, 0])
    grid.insert('far', [20, 0, 20], [1, 1, 1], [0, 0, 0])

    const hits = grid.queryRadius(0, 0, 2)
    expect(hits).toContain('near')
    expect(hits).not.toContain('far')
  })
})
