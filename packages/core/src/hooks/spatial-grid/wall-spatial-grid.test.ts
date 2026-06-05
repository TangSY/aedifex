import { describe, expect, test } from 'bun:test'
import { WallSpatialGrid } from './wall-spatial-grid'

// WallSpatialGrid stores wall-attached placements as (tStart, tEnd, yStart, yEnd, side).
// Conflict matrix:
//   - 'wall' (full-thickness) blocks both sides → conflicts with everything
//   - 'wall-side' (one face only) conflicts with same-side or any 'wall' item
// EPSILON=0.001 for tStart/tEnd/yStart/yEnd overlap tolerance.
// AUTO_SNAP_MARGIN=0.05 used when y bottom/top exceeds wall bounds.

const WALL_LEN = 4
const WALL_HEIGHT = 2.5

describe('WallSpatialGrid - boundary rejection', () => {
  test('item exceeding wall length (tStart < 0) is rejected', () => {
    const grid = new WallSpatialGrid()
    // tCenter=0, width=2 → tStart = 0 - 2/4/2 = -0.25 < 0
    const result = grid.canPlaceOnWall(
      'w1',
      WALL_LEN,
      WALL_HEIGHT,
      0,
      2,
      0,
      1,
    )
    expect(result.valid).toBe(false)
  })

  test('item exceeding wall length (tEnd > 1) is rejected', () => {
    const grid = new WallSpatialGrid()
    // tCenter=1, width=2 → tEnd = 1 + 2/4/2 = 1.25 > 1
    const result = grid.canPlaceOnWall('w1', WALL_LEN, WALL_HEIGHT, 1, 2, 0, 1)
    expect(result.valid).toBe(false)
  })
})

describe('WallSpatialGrid - autoAdjustYPosition (AUTO_SNAP_MARGIN=0.05)', () => {
  test('item that fits: no adjustment', () => {
    const grid = new WallSpatialGrid()
    const result = grid.canPlaceOnWall('w1', WALL_LEN, WALL_HEIGHT, 0.5, 1, 0.5, 1)
    expect(result.wasAdjusted).toBe(false)
    expect(result.adjustedY).toBe(0.5)
    expect(result.valid).toBe(true)
  })

  test('yTop > wallHeight: snaps down by AUTO_SNAP_MARGIN (0.05) from ceiling', () => {
    const grid = new WallSpatialGrid()
    // itemHeight=1, yBottom=2.0 → yTop=3.0 > 2.5
    // Expected adjustedY = 2.5 - 1 - 0.05 = 1.45
    const result = grid.canPlaceOnWall('w1', WALL_LEN, WALL_HEIGHT, 0.5, 1, 2.0, 1)
    expect(result.wasAdjusted).toBe(true)
    expect(result.adjustedY).toBeCloseTo(1.45, 5)
  })

  test('yBottom < 0: snaps up to AUTO_SNAP_MARGIN (0.05) above floor', () => {
    const grid = new WallSpatialGrid()
    const result = grid.canPlaceOnWall('w1', WALL_LEN, WALL_HEIGHT, 0.5, 1, -0.5, 1)
    expect(result.wasAdjusted).toBe(true)
    expect(result.adjustedY).toBeCloseTo(0.05, 5)
  })

  test('item taller than wall: snapped Y is clamped to 0 (Math.max guard)', () => {
    const grid = new WallSpatialGrid()
    // itemHeight=5, wallHeight=2.5 → 2.5 - 5 - 0.05 = -2.55 → clamp to 0
    const result = grid.canPlaceOnWall('w1', WALL_LEN, WALL_HEIGHT, 0.5, 1, 3, 5)
    expect(result.wasAdjusted).toBe(true)
    expect(result.adjustedY).toBe(0)
  })
})

describe('WallSpatialGrid - checkSideConflict matrix', () => {
  function fillWall(grid: WallSpatialGrid, attachType: 'wall' | 'wall-side', side?: 'front' | 'back') {
    grid.insert({
      itemId: 'existing',
      wallId: 'w1',
      tStart: 0.4,
      tEnd: 0.6,
      yStart: 0.5,
      yEnd: 1.5,
      attachType,
      side,
    })
  }

  test("'wall' (new) conflicts with anything existing — even opposite 'wall-side'", () => {
    const grid = new WallSpatialGrid()
    fillWall(grid, 'wall-side', 'back')

    // New 'wall' item at same t,y overlapping; 'wall' blocks both sides
    const result = grid.canPlaceOnWall(
      'w1',
      WALL_LEN,
      WALL_HEIGHT,
      0.5, // tCenter overlaps [0.4, 0.6]
      0.2, // width
      0.8, // yBottom, overlaps [0.5, 1.5]
      0.3, // itemHeight
      'wall',
    )
    expect(result.valid).toBe(false)
    expect(result.conflictIds).toContain('existing')
  })

  test("existing 'wall' blocks new 'wall-side' on any side", () => {
    const grid = new WallSpatialGrid()
    fillWall(grid, 'wall', undefined)

    const result = grid.canPlaceOnWall(
      'w1',
      WALL_LEN,
      WALL_HEIGHT,
      0.5,
      0.2,
      0.8,
      0.3,
      'wall-side',
      'front',
    )
    expect(result.valid).toBe(false)
  })

  test("two 'wall-side' items on opposite sides do NOT conflict (both defined)", () => {
    const grid = new WallSpatialGrid()
    fillWall(grid, 'wall-side', 'back')

    const result = grid.canPlaceOnWall(
      'w1',
      WALL_LEN,
      WALL_HEIGHT,
      0.5,
      0.2,
      0.8,
      0.3,
      'wall-side',
      'front',
    )
    expect(result.valid).toBe(true)
  })

  test("two 'wall-side' items on the same side conflict", () => {
    const grid = new WallSpatialGrid()
    fillWall(grid, 'wall-side', 'front')

    const result = grid.canPlaceOnWall(
      'w1',
      WALL_LEN,
      WALL_HEIGHT,
      0.5,
      0.2,
      0.8,
      0.3,
      'wall-side',
      'front',
    )
    expect(result.valid).toBe(false)
  })

  test("'wall-side' with undefined side conservatively conflicts with any 'wall-side'", () => {
    const grid = new WallSpatialGrid()
    fillWall(grid, 'wall-side', 'front')

    // New 'wall-side' without a side — should be conservative (conflict)
    const result = grid.canPlaceOnWall(
      'w1',
      WALL_LEN,
      WALL_HEIGHT,
      0.5,
      0.2,
      0.8,
      0.3,
      'wall-side',
      undefined,
    )
    expect(result.valid).toBe(false)
  })
})

describe('WallSpatialGrid - EPSILON tolerance (0.001) lets adjacent items pass', () => {
  test('items exactly touching at tEnd / tStart do not conflict', () => {
    const grid = new WallSpatialGrid()
    grid.insert({
      itemId: 'left',
      wallId: 'w1',
      tStart: 0.2,
      tEnd: 0.4,
      yStart: 0,
      yEnd: 1,
      attachType: 'wall',
    })
    // wallLength=1, tCenter=0.6, width=0.4 → halfW = 0.4/1/2 = 0.2
    // tStart = 0.6 - 0.2 = 0.4, tEnd = 0.6 + 0.2 = 0.8
    // Touches "left" exactly at 0.4. tOverlap = (0.4 < 0.4 - eps) → false → no conflict
    const result = grid.canPlaceOnWall(
      'w1',
      1, // wallLength=1 for simpler math
      WALL_HEIGHT,
      0.6,
      0.4,
      0.0,
      1,
      'wall',
    )
    expect(result.valid).toBe(true)
  })
})

describe('WallSpatialGrid - bookkeeping', () => {
  test('removeWall returns ids and clears reverse lookup', () => {
    const grid = new WallSpatialGrid()
    grid.insert({ itemId: 'a', wallId: 'w1', tStart: 0, tEnd: 0.2, yStart: 0, yEnd: 1, attachType: 'wall' })
    grid.insert({ itemId: 'b', wallId: 'w1', tStart: 0.5, tEnd: 0.6, yStart: 0, yEnd: 1, attachType: 'wall' })

    const removed = grid.removeWall('w1')
    expect(removed.sort()).toEqual(['a', 'b'])
    expect(grid.getWallForItem('a')).toBeUndefined()
    expect(grid.getWallForItem('b')).toBeUndefined()
  })

  test('removeByItemId removes via reverse lookup', () => {
    const grid = new WallSpatialGrid()
    grid.insert({ itemId: 'a', wallId: 'w1', tStart: 0, tEnd: 0.2, yStart: 0, yEnd: 1, attachType: 'wall' })
    expect(grid.getWallForItem('a')).toBe('w1')

    grid.removeByItemId('a')
    expect(grid.getWallForItem('a')).toBeUndefined()
  })

  test('ignoreIds skips matching items in conflict check (re-validating same item)', () => {
    const grid = new WallSpatialGrid()
    grid.insert({ itemId: 'a', wallId: 'w1', tStart: 0.4, tEnd: 0.6, yStart: 0.5, yEnd: 1.5, attachType: 'wall' })

    const withoutIgnore = grid.canPlaceOnWall('w1', WALL_LEN, WALL_HEIGHT, 0.5, 0.5, 0.5, 1, 'wall')
    expect(withoutIgnore.valid).toBe(false)

    const withIgnore = grid.canPlaceOnWall(
      'w1',
      WALL_LEN,
      WALL_HEIGHT,
      0.5,
      0.5,
      0.5,
      1,
      'wall',
      undefined,
      ['a'],
    )
    expect(withIgnore.valid).toBe(true)
  })
})
