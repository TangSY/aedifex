import { describe, it, expect, beforeEach } from 'vitest'
import { SpatialGrid } from '../hooks/spatial-grid/spatial-grid'

describe('SpatialGrid', () => {
  let grid: SpatialGrid

  beforeEach(() => {
    grid = new SpatialGrid({ cellSize: 0.5 })
  })

  // ============================================================================
  // insert / getItemCount
  // ============================================================================

  describe('insert', () => {
    it('increases item count after inserting an item', () => {
      grid.insert('a', [0, 0, 0], [1, 1, 1], [0, 0, 0])
      expect(grid.getItemCount()).toBe(1)
    })

    it('inserting multiple items increments count correctly', () => {
      grid.insert('a', [0, 0, 0], [1, 1, 1], [0, 0, 0])
      grid.insert('b', [5, 0, 5], [1, 1, 1], [0, 0, 0])
      expect(grid.getItemCount()).toBe(2)
    })

    it('inserting the same item twice does not duplicate it', () => {
      grid.insert('a', [0, 0, 0], [1, 1, 1], [0, 0, 0])
      grid.insert('a', [0, 0, 0], [1, 1, 1], [0, 0, 0])
      // insert overwrites the item cells, so count stays 1
      expect(grid.getItemCount()).toBe(1)
    })
  })

  // ============================================================================
  // remove
  // ============================================================================

  describe('remove', () => {
    it('decreases item count after removing an item', () => {
      grid.insert('a', [0, 0, 0], [1, 1, 1], [0, 0, 0])
      grid.remove('a')
      expect(grid.getItemCount()).toBe(0)
    })

    it('removing a non-existent item does not throw', () => {
      expect(() => grid.remove('nonexistent')).not.toThrow()
      expect(grid.getItemCount()).toBe(0)
    })

    it('removed item no longer appears in canPlace conflicts', () => {
      grid.insert('a', [0, 0, 0], [1, 1, 1], [0, 0, 0])
      grid.remove('a')
      const result = grid.canPlace([0, 0, 0], [1, 1, 1], [0, 0, 0])
      expect(result.valid).toBe(true)
      expect(result.conflictIds).toHaveLength(0)
    })
  })

  // ============================================================================
  // update
  // ============================================================================

  describe('update', () => {
    it('updates item position and reflects new location in canPlace', () => {
      grid.insert('a', [0, 0, 0], [1, 1, 1], [0, 0, 0])
      // Move item far away
      grid.update('a', [100, 0, 100], [1, 1, 1], [0, 0, 0])

      // Original position should now be free
      const atOrigin = grid.canPlace([0, 0, 0], [1, 1, 1], [0, 0, 0])
      expect(atOrigin.valid).toBe(true)

      // New position should be occupied
      const atNewPos = grid.canPlace([100, 0, 100], [1, 1, 1], [0, 0, 0])
      expect(atNewPos.valid).toBe(false)
      expect(atNewPos.conflictIds).toContain('a')
    })

    it('item count stays the same after update', () => {
      grid.insert('a', [0, 0, 0], [1, 1, 1], [0, 0, 0])
      grid.update('a', [10, 0, 10], [1, 1, 1], [0, 0, 0])
      expect(grid.getItemCount()).toBe(1)
    })
  })

  // ============================================================================
  // canPlace
  // ============================================================================

  describe('canPlace', () => {
    it('returns valid=true for empty space', () => {
      const result = grid.canPlace([0, 0, 0], [1, 1, 1], [0, 0, 0])
      expect(result.valid).toBe(true)
      expect(result.conflictIds).toHaveLength(0)
    })

    it('returns valid=false when overlapping an existing item', () => {
      grid.insert('a', [0, 0, 0], [1, 1, 1], [0, 0, 0])
      const result = grid.canPlace([0, 0, 0], [1, 1, 1], [0, 0, 0])
      expect(result.valid).toBe(false)
      expect(result.conflictIds).toContain('a')
    })

    it('returns multiple conflictIds when overlapping multiple items', () => {
      grid.insert('a', [0, 0, 0], [1, 1, 1], [0, 0, 0])
      grid.insert('b', [0.2, 0, 0.2], [0.5, 1, 0.5], [0, 0, 0])
      const result = grid.canPlace([0, 0, 0], [1, 1, 1], [0, 0, 0])
      expect(result.valid).toBe(false)
      expect(result.conflictIds).toContain('a')
      expect(result.conflictIds).toContain('b')
    })

    it('respects ignoreIds — ignores specified items when checking placement', () => {
      grid.insert('a', [0, 0, 0], [1, 1, 1], [0, 0, 0])
      const result = grid.canPlace([0, 0, 0], [1, 1, 1], [0, 0, 0], ['a'])
      expect(result.valid).toBe(true)
      expect(result.conflictIds).toHaveLength(0)
    })

    it('ignoreIds only ignores specified items, not others', () => {
      grid.insert('a', [0, 0, 0], [1, 1, 1], [0, 0, 0])
      grid.insert('b', [0, 0, 0], [1, 1, 1], [0, 0, 0])
      const result = grid.canPlace([0, 0, 0], [1, 1, 1], [0, 0, 0], ['a'])
      expect(result.valid).toBe(false)
      expect(result.conflictIds).toContain('b')
      expect(result.conflictIds).not.toContain('a')
    })
  })

  // ============================================================================
  // Adjacent items (touching but not overlapping)
  // ============================================================================

  describe('adjacent items', () => {
    it('items that exactly touch (share a face) do not conflict', () => {
      // Item A occupies [-0.5, 0.5] in X, [-0.5, 0.5] in Z  (1x1 centered at origin)
      grid.insert('a', [0, 0, 0], [1, 1, 1], [0, 0, 0])
      // Item B starts exactly where A ends in X (at x=0.5)
      // Center of B is at x=1.0, so its range is [0.5, 1.5]
      const result = grid.canPlace([1.0, 0, 0], [1, 1, 1], [0, 0, 0])
      expect(result.valid).toBe(true)
    })

    it('items that slightly overlap do conflict', () => {
      grid.insert('a', [0, 0, 0], [1, 1, 1], [0, 0, 0])
      // Overlap by a small amount (0.1 units)
      const result = grid.canPlace([0.9, 0, 0], [1, 1, 1], [0, 0, 0])
      expect(result.valid).toBe(false)
    })
  })

  // ============================================================================
  // Rotated items
  // ============================================================================

  describe('rotated items', () => {
    it('90° rotation swaps effective width and depth for cell coverage', () => {
      // A 2x1 item (width=2, depth=1) at 90° rotation becomes effectively 1x2
      const rotation90: [number, number, number] = [0, Math.PI / 2, 0]
      const noRotation: [number, number, number] = [0, 0, 0]

      const gridA = new SpatialGrid({ cellSize: 0.5 })
      const gridB = new SpatialGrid({ cellSize: 0.5 })

      gridA.insert('a', [0, 0, 0], [2, 1, 1], noRotation)
      gridB.insert('b', [0, 0, 0], [2, 1, 1], rotation90)

      // With no rotation, item covers more X-extent
      // At x=0.8 z=0, no rotation item should conflict; rotated item may not
      const conflictNoRot = gridA.canPlace([0.8, 0, 0], [0.1, 1, 0.1], noRotation)
      expect(conflictNoRot.valid).toBe(false)

      // With 90° rotation, the wide extent is along Z; at x=0.8 the rotated item should be free
      const conflictRot = gridB.canPlace([0.8, 0, 0], [0.1, 1, 0.1], noRotation)
      expect(conflictRot.valid).toBe(true)
    })

    it('rotated item can be placed where its footprint falls', () => {
      const rotation90: [number, number, number] = [0, Math.PI / 2, 0]
      grid.insert('a', [0, 0, 0], [2, 1, 1], rotation90)
      // The rotated 2x1 item now has footprint ~1x2 (depth becomes 2 along Z)
      // So at z=0.8 it should conflict
      const result = grid.canPlace([0, 0, 0.8], [0.1, 1, 0.1], [0, 0, 0])
      expect(result.valid).toBe(false)
    })
  })

  // ============================================================================
  // queryRadius
  // ============================================================================

  describe('queryRadius', () => {
    it('returns items within the given radius', () => {
      grid.insert('nearby', [0, 0, 0], [0.5, 0.5, 0.5], [0, 0, 0])
      const result = grid.queryRadius(0, 0, 1)
      expect(result).toContain('nearby')
    })

    it('returns empty array when no items are nearby', () => {
      grid.insert('far', [100, 0, 100], [1, 1, 1], [0, 0, 0])
      const result = grid.queryRadius(0, 0, 1)
      expect(result).not.toContain('far')
    })

    it('returns empty array for empty grid', () => {
      const result = grid.queryRadius(0, 0, 5)
      expect(result).toHaveLength(0)
    })

    it('returns multiple items within radius', () => {
      grid.insert('a', [0, 0, 0], [0.5, 0.5, 0.5], [0, 0, 0])
      grid.insert('b', [0.5, 0, 0.5], [0.5, 0.5, 0.5], [0, 0, 0])
      grid.insert('far', [50, 0, 50], [0.5, 0.5, 0.5], [0, 0, 0])
      const result = grid.queryRadius(0, 0, 2)
      expect(result).toContain('a')
      expect(result).toContain('b')
      expect(result).not.toContain('far')
    })

    it('radius boundary: item just outside radius is not returned', () => {
      // With cellSize=0.5 and radius=0.4, cellRadius = ceil(0.4/0.5) = 1
      // Item at x=2, z=2 is 2 cells away and should be outside radius=0.4
      grid.insert('edge', [2, 0, 2], [0.1, 0.1, 0.1], [0, 0, 0])
      const result = grid.queryRadius(0, 0, 0.4)
      expect(result).not.toContain('edge')
    })
  })

  // ============================================================================
  // getItemCount
  // ============================================================================

  describe('getItemCount', () => {
    it('returns 0 for empty grid', () => {
      expect(grid.getItemCount()).toBe(0)
    })

    it('tracks correct count through inserts and removes', () => {
      grid.insert('a', [0, 0, 0], [1, 1, 1], [0, 0, 0])
      grid.insert('b', [5, 0, 5], [1, 1, 1], [0, 0, 0])
      expect(grid.getItemCount()).toBe(2)
      grid.remove('a')
      expect(grid.getItemCount()).toBe(1)
      grid.remove('b')
      expect(grid.getItemCount()).toBe(0)
    })
  })

  // ============================================================================
  // Multiple items in same cell
  // ============================================================================

  describe('multiple items in same cell', () => {
    it('detects conflict when two items are in the same cell', () => {
      // Both items are tiny and placed at almost the same location
      grid.insert('a', [0, 0, 0], [0.1, 0.1, 0.1], [0, 0, 0])
      grid.insert('b', [0.05, 0, 0.05], [0.1, 0.1, 0.1], [0, 0, 0])
      const result = grid.canPlace([0, 0, 0], [0.1, 0.1, 0.1], [0, 0, 0])
      expect(result.valid).toBe(false)
    })
  })
})
