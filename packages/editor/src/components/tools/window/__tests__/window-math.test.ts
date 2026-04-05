import { describe, expect, it, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let mockNodes: Record<string, unknown> = {}

vi.mock('@aedifex/core', () => ({
  useScene: {
    getState: () => ({ nodes: mockNodes }),
  },
  getScaledDimensions: (item: { asset: { dimensions: [number, number, number] }; scale: [number, number, number] }) => {
    const [w, h, d] = item.asset.dimensions
    const [sx, sy, sz] = item.scale
    return [w * sx, h * sy, d * sz] as [number, number, number]
  },
}))

import { wallLocalToWorld, clampToWall, hasWallChildOverlap } from '../window-math'
import type { WallNode, DoorNode, WindowNode, ItemNode } from '@aedifex/core'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWall(
  id: string,
  start: [number, number],
  end: [number, number],
  height?: number,
  children: string[] = [],
): WallNode {
  return {
    id: id as WallNode['id'],
    type: 'wall',
    name: 'Test Wall',
    start,
    end,
    height,
    children: children as WallNode['children'],
    frontSide: 'unknown',
    backSide: 'unknown',
    object: 'node',
    parentId: null,
    visible: true,
    metadata: null,
  } as WallNode
}

function makeDoor(
  id: string,
  posX: number,
  posY: number,
  width: number,
  height: number,
): DoorNode {
  return {
    id: id as DoorNode['id'],
    type: 'door',
    name: 'Test Door',
    position: [posX, posY, 0],
    rotation: [0, 0, 0],
    width,
    height,
    frameThickness: 0.05,
    frameDepth: 0.07,
    threshold: true,
    thresholdHeight: 0.02,
    hingesSide: 'left',
    swingDirection: 'inward',
    segments: [],
    handle: true,
    handleHeight: 1.05,
    handleSide: 'right',
    contentPadding: [0.04, 0.04],
    doorCloser: false,
    panicBar: false,
    panicBarHeight: 1.0,
    object: 'node',
    parentId: null,
    visible: true,
    metadata: null,
  } as DoorNode
}

function makeWindow(
  id: string,
  posX: number,
  posY: number,
  width: number,
  height: number,
): WindowNode {
  return {
    id: id as WindowNode['id'],
    type: 'window',
    name: 'Test Window',
    position: [posX, posY, 0],
    rotation: [0, 0, 0],
    width,
    height,
    frameThickness: 0.05,
    frameDepth: 0.07,
    columnRatios: [1],
    rowRatios: [1],
    columnDividerThickness: 0.03,
    rowDividerThickness: 0.03,
    sill: true,
    sillDepth: 0.08,
    sillThickness: 0.03,
    object: 'node',
    parentId: null,
    visible: true,
    metadata: null,
  } as WindowNode
}

function makeWallItem(
  id: string,
  posX: number,
  posY: number,
  width: number,
  height: number,
): ItemNode {
  return {
    id: id as ItemNode['id'],
    type: 'item',
    name: 'Test Item',
    position: [posX, posY, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    children: [],
    asset: {
      id: 'wall-painting',
      category: 'decor',
      name: 'Wall Painting',
      thumbnail: '/thumb.webp',
      src: '/model.glb',
      dimensions: [width, height, 0.05],
      attachTo: 'wall',
      offset: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    object: 'node',
    parentId: null,
    visible: true,
    metadata: null,
  } as ItemNode
}

// ---------------------------------------------------------------------------
// wallLocalToWorld (identical formula to door-math)
// ---------------------------------------------------------------------------

describe('wallLocalToWorld', () => {
  it('converts wall-local position to world for a horizontal wall (0° angle)', () => {
    const wall = makeWall('wall:1', [0, 0], [4, 0])
    const result = wallLocalToWorld(wall, 2, 1)
    expect(result[0]).toBeCloseTo(2, 10)
    expect(result[1]).toBeCloseTo(1, 10)
    expect(result[2]).toBeCloseTo(0, 10)
  })

  it('converts wall-local position to world for a vertical wall (90° angle)', () => {
    const wall = makeWall('wall:2', [0, 0], [0, 4])
    const result = wallLocalToWorld(wall, 2, 1)
    expect(result[0]).toBeCloseTo(0, 5)
    expect(result[1]).toBeCloseTo(1, 10)
    expect(result[2]).toBeCloseTo(2, 5)
  })

  it('converts wall-local position to world for a 45° diagonal wall', () => {
    const wall = makeWall('wall:3', [0, 0], [1, 1])
    const len = Math.sqrt(2)
    const result = wallLocalToWorld(wall, len, 0)
    expect(result[0]).toBeCloseTo(1, 5)
    expect(result[1]).toBeCloseTo(0, 10)
    expect(result[2]).toBeCloseTo(1, 5)
  })

  it('applies levelYOffset and slabElevation to the Y component', () => {
    const wall = makeWall('wall:4', [0, 0], [4, 0])
    const result = wallLocalToWorld(wall, 1, 0.5, 3.0, 0.2)
    // Y = 0.2 + 0.5 + 3.0 = 3.7
    expect(result[1]).toBeCloseTo(3.7, 10)
  })

  it('respects wall start offset for world XZ coordinates', () => {
    const wall = makeWall('wall:5', [2, 3], [6, 3])
    // angle=0 → world = [2 + 2*1, 1, 3 + 2*0] = [4, 1, 3]
    const result = wallLocalToWorld(wall, 2, 1)
    expect(result[0]).toBeCloseTo(4, 10)
    expect(result[1]).toBeCloseTo(1, 10)
    expect(result[2]).toBeCloseTo(3, 10)
  })
})

// ---------------------------------------------------------------------------
// clampToWall — window version clamps both X and Y
// ---------------------------------------------------------------------------

describe('clampToWall', () => {
  it('clamps X when position is too close to wall start', () => {
    // Wall length=4, window width=1.5 → min clampedX = 0.75
    const wall = makeWall('wall:1', [0, 0], [4, 0])
    const { clampedX } = clampToWall(wall, 0.2, 1.5, 1.5, 1.0)
    expect(clampedX).toBe(0.75)
  })

  it('clamps X when position exceeds wall end', () => {
    // Wall length=4, window width=1.5 → max clampedX = 3.25
    const wall = makeWall('wall:1', [0, 0], [4, 0])
    const { clampedX } = clampToWall(wall, 3.9, 1.5, 1.5, 1.0)
    expect(clampedX).toBe(3.25)
  })

  it('passes through valid X position unchanged', () => {
    const wall = makeWall('wall:1', [0, 0], [4, 0])
    const { clampedX } = clampToWall(wall, 2, 1.5, 1.5, 1.0)
    expect(clampedX).toBe(2)
  })

  it('clamps Y when window is too close to wall bottom', () => {
    // Wall height defaults to 2.5, window height=1.0 → min clampedY = 0.5
    const wall = makeWall('wall:1', [0, 0], [4, 0]) // height=undefined → defaults to 2.5
    const { clampedY } = clampToWall(wall, 2, 0.1, 1.5, 1.0)
    expect(clampedY).toBe(0.5)
  })

  it('clamps Y when window exceeds wall height', () => {
    // Wall height=2.5, window height=1.0 → max clampedY = 2.0
    const wall = makeWall('wall:1', [0, 0], [4, 0])
    const { clampedY } = clampToWall(wall, 2, 2.4, 1.5, 1.0)
    expect(clampedY).toBe(2.0)
  })

  it('passes through valid Y position unchanged', () => {
    const wall = makeWall('wall:1', [0, 0], [4, 0])
    const { clampedY } = clampToWall(wall, 2, 1.5, 1.5, 1.0)
    expect(clampedY).toBe(1.5)
  })

  it('respects explicit wall height for Y clamping', () => {
    // Custom height=3.0, window height=1.0 → max clampedY = 2.5
    const wall = makeWall('wall:1', [0, 0], [4, 0], 3.0)
    const { clampedY } = clampToWall(wall, 2, 2.8, 1.5, 1.0)
    expect(clampedY).toBe(2.5)
  })

  it('uses default wall height of 2.5 when height is undefined', () => {
    const wall = makeWall('wall:1', [0, 0], [4, 0]) // height is undefined
    // window height=1.5 → max clampedY = 2.5 - 0.75 = 1.75
    const { clampedY } = clampToWall(wall, 2, 3.0, 1.5, 1.5)
    expect(clampedY).toBe(1.75)
  })

  it('handles small wall: both X and Y clamped simultaneously', () => {
    // Wall length=2, height=2.0, window 1.5×1.0
    // min X=0.75, max X=1.25, min Y=0.5, max Y=1.5
    const wall = makeWall('wall:1', [0, 0], [2, 0], 2.0)
    const { clampedX, clampedY } = clampToWall(wall, 0.1, 0.1, 1.5, 1.0)
    expect(clampedX).toBe(0.75)
    expect(clampedY).toBe(0.5)
  })
})

// ---------------------------------------------------------------------------
// hasWallChildOverlap
// ---------------------------------------------------------------------------

describe('hasWallChildOverlap', () => {
  beforeEach(() => {
    mockNodes = {}
  })

  it('returns false when wall has no children', () => {
    const wall = makeWall('wall:1', [0, 0], [4, 0], undefined, [])
    mockNodes['wall:1'] = wall

    const result = hasWallChildOverlap('wall:1', 2, 1.5, 1.5, 1.0)
    expect(result).toBe(false)
  })

  it('returns true when proposed window overlaps an existing window at same position', () => {
    const existingWindow = makeWindow('window:1', 2, 1.5, 1.5, 1.0)
    const wall = makeWall('wall:1', [0, 0], [4, 0], undefined, ['window:1'])
    mockNodes['wall:1'] = wall
    mockNodes['window:1'] = existingWindow

    const result = hasWallChildOverlap('wall:1', 2, 1.5, 1.5, 1.0)
    expect(result).toBe(true)
  })

  it('returns false when windows are separated with no overlap', () => {
    // Window 1: center X=0.75, bounds X:[0, 1.5]
    const existingWindow = makeWindow('window:1', 0.75, 1.5, 1.5, 1.0)
    const wall = makeWall('wall:1', [0, 0], [4, 0], undefined, ['window:1'])
    mockNodes['wall:1'] = wall
    mockNodes['window:1'] = existingWindow

    // New window centered at X=3, bounds X:[2.25, 3.75] — no overlap
    const result = hasWallChildOverlap('wall:1', 3, 1.5, 1.5, 1.0)
    expect(result).toBe(false)
  })

  it('ignores the child identified by ignoreId (window being moved)', () => {
    const existingWindow = makeWindow('window:1', 2, 1.5, 1.5, 1.0)
    const wall = makeWall('wall:1', [0, 0], [4, 0], undefined, ['window:1'])
    mockNodes['wall:1'] = wall
    mockNodes['window:1'] = existingWindow

    const result = hasWallChildOverlap('wall:1', 2, 1.5, 1.5, 1.0, 'window:1')
    expect(result).toBe(false)
  })

  it('returns true when proposed window overlaps an existing door', () => {
    // Door at center X=2, center Y=1.05, half-width=0.45, half-height=1.05
    // Door bounds: X:[1.55, 2.45], Y:[0, 2.1]
    const existingDoor = makeDoor('door:1', 2, 1.05, 0.9, 2.1)
    const wall = makeWall('wall:1', [0, 0], [4, 0], undefined, ['door:1'])
    mockNodes['wall:1'] = wall
    mockNodes['door:1'] = existingDoor

    // Window at X=2, Y=1.5 → X:[1.25, 2.75], Y:[1.0, 2.0] → overlaps door
    const result = hasWallChildOverlap('wall:1', 2, 1.5, 1.5, 1.0)
    expect(result).toBe(true)
  })

  it('returns true when proposed window overlaps a wall-attached item', () => {
    const wallItem = makeWallItem('item:1', 2, 0, 0.8, 0.5)
    const wall = makeWall('wall:1', [0, 0], [4, 0], undefined, ['item:1'])
    mockNodes['wall:1'] = wall
    mockNodes['item:1'] = wallItem

    // Window at X=2, Y=0.25 → X:[1.25, 2.75], Y:[0, 0.5] → overlaps item bounds
    const result = hasWallChildOverlap('wall:1', 2, 0.25, 1.5, 0.5)
    expect(result).toBe(true)
  })

  it('skips non-wall items (floor furniture)', () => {
    const floorItem: ItemNode = {
      id: 'item:2' as ItemNode['id'],
      type: 'item',
      name: 'Chair',
      position: [2, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      children: [],
      asset: {
        id: 'chair',
        category: 'furniture',
        name: 'Chair',
        thumbnail: '/thumb.webp',
        src: '/model.glb',
        dimensions: [0.6, 0.9, 0.6],
        // attachTo is undefined — floor placement
        offset: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      object: 'node',
      parentId: null,
      visible: true,
      metadata: null,
    } as ItemNode
    const wall = makeWall('wall:1', [0, 0], [4, 0], undefined, ['item:2'])
    mockNodes['wall:1'] = wall
    mockNodes['item:2'] = floorItem

    const result = hasWallChildOverlap('wall:1', 2, 1.5, 1.5, 1.0)
    expect(result).toBe(false)
  })

  it('returns true when wall is not found in nodes', () => {
    const result = hasWallChildOverlap('wall:nonexistent', 2, 1.5, 1.5, 1.0)
    expect(result).toBe(true)
  })

  it('skips dangling child references (child missing from nodes)', () => {
    const wall = makeWall('wall:1', [0, 0], [4, 0], undefined, ['window:ghost'])
    mockNodes['wall:1'] = wall

    const result = hasWallChildOverlap('wall:1', 2, 1.5, 1.5, 1.0)
    expect(result).toBe(false)
  })

  it('detects partial X overlap (window overlapping to the right of existing window)', () => {
    // Existing window at X=1.5, Y=1.5, width=1.5, height=1.0
    // Bounds: X:[0.75, 2.25], Y:[1.0, 2.0]
    const existingWindow = makeWindow('window:1', 1.5, 1.5, 1.5, 1.0)
    const wall = makeWall('wall:1', [0, 0], [5, 0], undefined, ['window:1'])
    mockNodes['wall:1'] = wall
    mockNodes['window:1'] = existingWindow

    // New window at X=2.5, Y=1.5, width=1.5
    // Bounds: X:[1.75, 3.25] — overlaps existing window's right edge [0.75,2.25]
    const result = hasWallChildOverlap('wall:1', 2.5, 1.5, 1.5, 1.0)
    expect(result).toBe(true)
  })

  it('returns false when windows are stacked vertically with no Y overlap', () => {
    // Existing window: Y=0.6, height=1.0 → Y bounds:[0.1, 1.1]
    const existingWindow = makeWindow('window:1', 2, 0.6, 1.5, 1.0)
    const wall = makeWall('wall:1', [0, 0], [4, 0], undefined, ['window:1'])
    mockNodes['wall:1'] = wall
    mockNodes['window:1'] = existingWindow

    // New window: Y=2.0, height=1.0 → Y bounds:[1.5, 2.5] — no overlap
    const result = hasWallChildOverlap('wall:1', 2, 2.0, 1.5, 1.0)
    expect(result).toBe(false)
  })
})
