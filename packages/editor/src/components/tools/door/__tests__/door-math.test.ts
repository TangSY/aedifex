import { describe, expect, it, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

// Mutable store state exposed to tests
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

import { wallLocalToWorld, clampToWall, hasWallChildOverlap } from '../door-math'
import type { WallNode, DoorNode, WindowNode, ItemNode } from '@aedifex/core'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWall(
  id: string,
  start: [number, number],
  end: [number, number],
  children: string[] = [],
): WallNode {
  return {
    id: id as WallNode['id'],
    type: 'wall',
    name: 'Test Wall',
    start,
    end,
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
// wallLocalToWorld
// ---------------------------------------------------------------------------

describe('wallLocalToWorld', () => {
  it('converts wall-local position to world for a horizontal wall (0° angle)', () => {
    // Wall along X axis: start=[0,0], end=[4,0]
    const wall = makeWall('wall:1', [0, 0], [4, 0])
    // localX=2, localY=1 → world = [0 + 2*cos(0), 0 + 1 + 0, 0 + 2*sin(0)] = [2, 1, 0]
    const result = wallLocalToWorld(wall, 2, 1)
    expect(result[0]).toBeCloseTo(2, 10)
    expect(result[1]).toBeCloseTo(1, 10)
    expect(result[2]).toBeCloseTo(0, 10)
  })

  it('converts wall-local position to world for a vertical wall (90° angle)', () => {
    // Wall along Z axis: start=[0,0], end=[0,4] → angle = PI/2
    const wall = makeWall('wall:2', [0, 0], [0, 4])
    // localX=2, localY=1 → cos(PI/2)≈0, sin(PI/2)≈1
    // world = [0 + 2*0, 0 + 1, 0 + 2*1] = [0, 1, 2]
    const result = wallLocalToWorld(wall, 2, 1)
    expect(result[0]).toBeCloseTo(0, 5)
    expect(result[1]).toBeCloseTo(1, 10)
    expect(result[2]).toBeCloseTo(2, 5)
  })

  it('converts wall-local position to world for a 45° diagonal wall', () => {
    // Wall diagonal: start=[0,0], end=[1,1] → angle = PI/4
    const wall = makeWall('wall:3', [0, 0], [1, 1])
    // localX=Math.sqrt(2), localY=0
    // world = [sqrt(2)*cos(PI/4), 0, sqrt(2)*sin(PI/4)] = [1, 0, 1]
    const len = Math.sqrt(2)
    const result = wallLocalToWorld(wall, len, 0)
    expect(result[0]).toBeCloseTo(1, 5)
    expect(result[1]).toBeCloseTo(0, 10)
    expect(result[2]).toBeCloseTo(1, 5)
  })

  it('applies levelYOffset and slabElevation to the Y component', () => {
    const wall = makeWall('wall:4', [0, 0], [4, 0])
    // localX=1, localY=0.5, levelYOffset=3.0, slabElevation=0.2
    // Y = 0.2 + 0.5 + 3.0 = 3.7
    const result = wallLocalToWorld(wall, 1, 0.5, 3.0, 0.2)
    expect(result[1]).toBeCloseTo(3.7, 10)
  })

  it('uses levelYOffset=0 and slabElevation=0 as defaults', () => {
    const wall = makeWall('wall:5', [1, 2], [5, 2])
    // Wall starts at x=1, z=2, angle=0
    // localX=2, localY=1 → world = [1+2, 0+1+0, 2+0] = [3, 1, 2]
    const result = wallLocalToWorld(wall, 2, 1)
    expect(result[0]).toBeCloseTo(3, 10)
    expect(result[1]).toBeCloseTo(1, 10)
    expect(result[2]).toBeCloseTo(2, 10)
  })
})

// ---------------------------------------------------------------------------
// clampToWall
// ---------------------------------------------------------------------------

describe('clampToWall', () => {
  it('clamps X when position is too close to wall start', () => {
    // Wall length=4, door width=1 → min clampedX = 0.5
    const wall = makeWall('wall:1', [0, 0], [4, 0])
    const { clampedX } = clampToWall(wall, 0.1, 1, 2.1)
    expect(clampedX).toBe(0.5)
  })

  it('clamps X when position exceeds wall end', () => {
    // Wall length=4, door width=1 → max clampedX = 3.5
    const wall = makeWall('wall:1', [0, 0], [4, 0])
    const { clampedX } = clampToWall(wall, 3.9, 1, 2.1)
    expect(clampedX).toBe(3.5)
  })

  it('passes through valid X position unchanged', () => {
    const wall = makeWall('wall:1', [0, 0], [4, 0])
    const { clampedX } = clampToWall(wall, 2, 1, 2.1)
    expect(clampedX).toBe(2)
  })

  it('always sets clampedY to height/2 (doors sit at floor level)', () => {
    const wall = makeWall('wall:1', [0, 0], [4, 0])
    const { clampedY } = clampToWall(wall, 2, 0.9, 2.1)
    expect(clampedY).toBe(1.05)
  })

  it('clampedY is height/2 regardless of provided localX', () => {
    const wall = makeWall('wall:1', [0, 0], [4, 0])
    expect(clampToWall(wall, 0, 0.9, 2.0).clampedY).toBe(1.0)
    expect(clampToWall(wall, 2, 0.9, 1.5).clampedY).toBe(0.75)
    expect(clampToWall(wall, 4, 0.9, 2.4).clampedY).toBe(1.2)
  })

  it('correctly computes wall length for diagonal wall', () => {
    // Wall [0,0] → [3,4]: length=5, door width=1 → range [0.5, 4.5]
    const wall = makeWall('wall:1', [0, 0], [3, 4])
    const { clampedX: clamped1 } = clampToWall(wall, 0.2, 1, 2.1)
    expect(clamped1).toBe(0.5)
    const { clampedX: clamped2 } = clampToWall(wall, 4.6, 1, 2.1)
    expect(clamped2).toBe(4.5)
    const { clampedX: clamped3 } = clampToWall(wall, 2.5, 1, 2.1)
    expect(clamped3).toBe(2.5)
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
    const wall = makeWall('wall:1', [0, 0], [4, 0], [])
    mockNodes['wall:1'] = wall

    const result = hasWallChildOverlap('wall:1', 2, 1.05, 0.9, 2.1)
    expect(result).toBe(false)
  })

  it('returns true when proposed door overlaps an existing door', () => {
    const existingDoor = makeDoor('door:1', 2, 1.05, 0.9, 2.1)
    const wall = makeWall('wall:1', [0, 0], [4, 0], ['door:1'])
    mockNodes['wall:1'] = wall
    mockNodes['door:1'] = existingDoor

    // New door at same position → should overlap
    const result = hasWallChildOverlap('wall:1', 2, 1.05, 0.9, 2.1)
    expect(result).toBe(true)
  })

  it('returns false when doors are far enough apart to not overlap', () => {
    const existingDoor = makeDoor('door:1', 0.5, 1.05, 0.9, 2.1)
    const wall = makeWall('wall:1', [0, 0], [4, 0], ['door:1'])
    mockNodes['wall:1'] = wall
    mockNodes['door:1'] = existingDoor

    // New door at X=3 is far from existing at X=0.5
    const result = hasWallChildOverlap('wall:1', 3, 1.05, 0.9, 2.1)
    expect(result).toBe(false)
  })

  it('ignores the child identified by ignoreId', () => {
    const existingDoor = makeDoor('door:1', 2, 1.05, 0.9, 2.1)
    const wall = makeWall('wall:1', [0, 0], [4, 0], ['door:1'])
    mockNodes['wall:1'] = wall
    mockNodes['door:1'] = existingDoor

    // Same position but ignoring the conflicting door (e.g. moving it)
    const result = hasWallChildOverlap('wall:1', 2, 1.05, 0.9, 2.1, 'door:1')
    expect(result).toBe(false)
  })

  it('ignores children listed in ignoreIds set', () => {
    const existingDoor = makeDoor('door:1', 2, 1.05, 0.9, 2.1)
    const wall = makeWall('wall:1', [0, 0], [4, 0], ['door:1'])
    mockNodes['wall:1'] = wall
    mockNodes['door:1'] = existingDoor

    const ignoreIds = new Set(['door:1'])
    const result = hasWallChildOverlap('wall:1', 2, 1.05, 0.9, 2.1, undefined, ignoreIds)
    expect(result).toBe(false)
  })

  it('returns true when proposed door overlaps an existing window', () => {
    // Window at X=2, center Y=1.5 (1.0–2.0), half-width=0.75 (1.25–2.75)
    const existingWindow = makeWindow('window:1', 2, 1.5, 1.5, 1.0)
    const wall = makeWall('wall:1', [0, 0], [4, 0], ['window:1'])
    mockNodes['wall:1'] = wall
    mockNodes['window:1'] = existingWindow

    // Door at X=2 with height 2.1 → bottom=0, top=2.1 → overlaps window [1.0,2.0]
    const result = hasWallChildOverlap('wall:1', 2, 1.05, 0.9, 2.1)
    expect(result).toBe(true)
  })

  it('returns true when proposed door overlaps a wall-attached item', () => {
    const wallItem = makeWallItem('item:1', 2, 0, 0.8, 0.5)
    const wall = makeWall('wall:1', [0, 0], [4, 0], ['item:1'])
    mockNodes['wall:1'] = wall
    mockNodes['item:1'] = wallItem

    // Door at X=2 overlaps item whose bounds are x:[1.6,2.4] y:[0,0.5]
    const result = hasWallChildOverlap('wall:1', 2, 1.05, 0.9, 2.1)
    expect(result).toBe(true)
  })

  it('skips items not attached to wall (floor items)', () => {
    const floorItem: ItemNode = {
      id: 'item:2' as ItemNode['id'],
      type: 'item',
      name: 'Floor Sofa',
      position: [2, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      children: [],
      asset: {
        id: 'sofa',
        category: 'furniture',
        name: 'Sofa',
        thumbnail: '/thumb.webp',
        src: '/model.glb',
        dimensions: [2, 0.9, 0.9],
        // attachTo is undefined — floor item
        offset: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      object: 'node',
      parentId: null,
      visible: true,
      metadata: null,
    } as ItemNode
    const wall = makeWall('wall:1', [0, 0], [4, 0], ['item:2'])
    mockNodes['wall:1'] = wall
    mockNodes['item:2'] = floorItem

    const result = hasWallChildOverlap('wall:1', 2, 1.05, 0.9, 2.1)
    expect(result).toBe(false)
  })

  it('skips children with isGhostRemoval metadata flag', () => {
    const ghostDoor = {
      ...makeDoor('door:1', 2, 1.05, 0.9, 2.1),
      metadata: { isGhostRemoval: true },
    }
    const wall = makeWall('wall:1', [0, 0], [4, 0], ['door:1'])
    mockNodes['wall:1'] = wall
    mockNodes['door:1'] = ghostDoor

    const result = hasWallChildOverlap('wall:1', 2, 1.05, 0.9, 2.1)
    expect(result).toBe(false)
  })

  it('returns true when wall is not found in nodes', () => {
    // Wall not registered in nodes
    const result = hasWallChildOverlap('wall:nonexistent', 2, 1.05, 0.9, 2.1)
    expect(result).toBe(true)
  })

  it('skips children that are missing from nodes (dangling reference)', () => {
    const wall = makeWall('wall:1', [0, 0], [4, 0], ['door:ghost'])
    mockNodes['wall:1'] = wall
    // 'door:ghost' is NOT in mockNodes

    const result = hasWallChildOverlap('wall:1', 2, 1.05, 0.9, 2.1)
    expect(result).toBe(false)
  })
})
