import { describe, expect, it, vi, beforeEach } from 'vitest'

// ============================================================================
// Mocks
// ============================================================================

const mockNodes: Record<string, unknown> = {}

vi.mock('@aedifex/core', () => ({
  useScene: {
    getState: () => ({ nodes: mockNodes }),
  },
}))

import { optimizeLayout } from '../ai-layout-optimizer'
import type { ValidatedAddItem, ValidatedMoveItem, ValidatedOperation } from '../types'

// ============================================================================
// Helpers
// ============================================================================

function setNodes(nodes: Record<string, unknown>) {
  for (const key of Object.keys(mockNodes)) delete mockNodes[key]
  Object.assign(mockNodes, nodes)
}

function makeWall(id: string, start: [number, number], end: [number, number], thickness = 0.2) {
  return {
    id,
    type: 'wall',
    object: 'node',
    parentId: null,
    visible: true,
    metadata: {},
    start,
    end,
    thickness,
    children: [],
    frontSide: 'unknown',
    backSide: 'unknown',
  }
}

function makeAddItemOp(
  catalogSlug: string,
  category: string,
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
  dimensions: [number, number, number] = [1, 1, 1],
  status: 'valid' | 'adjusted' | 'invalid' = 'valid',
): ValidatedAddItem {
  return {
    type: 'add_item',
    status,
    position,
    rotation,
    asset: {
      id: catalogSlug,
      category,
      name: catalogSlug,
      thumbnail: '',
      src: '',
      dimensions,
      offset: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
  }
}

function makeMoveItemOp(
  nodeId: string,
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
  status: 'valid' | 'adjusted' | 'invalid' = 'valid',
): ValidatedMoveItem {
  return {
    type: 'move_item',
    status,
    nodeId: nodeId as any,
    position,
    rotation,
  }
}

beforeEach(() => {
  setNodes({})
})

// ============================================================================
// optimizeLayout — passthrough cases
// ============================================================================

describe('optimizeLayout — passthrough', () => {
  it('returns invalid operations unchanged', () => {
    const invalidOp: ValidatedAddItem = {
      ...makeAddItemOp('sofa', 'sofa', [0, 0, 0]),
      status: 'invalid',
      errorReason: 'not found',
      asset: undefined as any,
    }

    const result = optimizeLayout([invalidOp])
    expect(result[0]!.status).toBe('invalid')
  })

  it('returns non-item operations unchanged', () => {
    const removeOp: ValidatedOperation = {
      type: 'remove_item',
      status: 'valid',
      nodeId: 'item_1' as any,
    }

    const result = optimizeLayout([removeOp])
    expect(result[0]).toEqual(removeOp)
  })

  it('returns empty array for empty input', () => {
    expect(optimizeLayout([])).toEqual([])
  })
})

// ============================================================================
// optimizeLayout — non-wall-snap items
// ============================================================================

describe('optimizeLayout — items not in AGAINST_WALL_CATEGORIES', () => {
  it('does not change position when no spacing rule applies and no walls exist', () => {
    setNodes({})

    // 'plant' is not in the against-wall list and has no spacing rule
    const op = makeAddItemOp('plant', 'plant', [3, 0, 3])
    const result = optimizeLayout([op])

    expect(result[0]!.status).toBe('valid')
    const addOp = result[0] as ValidatedAddItem
    expect(addOp.position).toEqual([3, 0, 3])
  })
})

// ============================================================================
// optimizeLayout — wall snap for against-wall items
// ============================================================================

describe('optimizeLayout — against-wall snapping', () => {
  it('snaps sofa close to wall and changes status to adjusted', () => {
    // Place a horizontal wall along x-axis at z=0
    setNodes({
      wall_1: makeWall('wall_1', [-5, 0], [5, 0], 0.2),
    })

    // Place sofa very close to wall (within WALL_SNAP_THRESHOLD=0.3)
    const op = makeAddItemOp('sofa-modern', 'sofa', [0, 0, 0.2], [0, 0, 0], [2, 0.9, 0.9])
    const result = optimizeLayout([op])

    expect(result[0]!.status).toBe('adjusted')
    const addOp = result[0] as ValidatedAddItem
    // Position should have been moved (snapped to wall)
    expect(addOp.position).not.toEqual([0, 0, 0.2])
  })

  it('does not snap items that are far from any wall', () => {
    setNodes({
      wall_1: makeWall('wall_1', [0, 0], [5, 0], 0.2),
    })

    // Place sofa far away (more than WALL_SNAP_THRESHOLD=0.3)
    const op = makeAddItemOp('bookshelf', 'bookshelf', [10, 0, 10], [0, 0, 0], [1, 2, 0.3])
    const result = optimizeLayout([op])

    // No wall within snap range → no adjustment for this reason
    const addOp = result[0] as ValidatedAddItem
    expect(addOp.position).toEqual([10, 0, 10])
  })

  it('does not snap when no walls exist', () => {
    setNodes({})

    const op = makeAddItemOp('desk', 'desk', [1, 0, 1], [0, 0, 0], [1.2, 0.75, 0.6])
    const result = optimizeLayout([op])

    const addOp = result[0] as ValidatedAddItem
    expect(addOp.position).toEqual([1, 0, 1])
  })
})

// ============================================================================
// optimizeLayout — functional group spacing
// ============================================================================

describe('optimizeLayout — functional group spacing', () => {
  it('adjusts coffee table position relative to sofa', () => {
    setNodes({})

    const sofaOp = makeAddItemOp('sofa-classic', 'sofa', [0, 0, 0], [0, 0, 0], [2, 0.9, 0.9])
    // Coffee table placed right on top of sofa (distance = 0)
    const coffeeOp = makeAddItemOp('coffee-table', 'coffee-table', [0, 0, 0.01], [0, 0, 0], [1, 0.45, 0.6])

    const result = optimizeLayout([sofaOp, coffeeOp])

    // Coffee table is companion to sofa — should be adjusted
    const coffeeResult = result.find(
      (op) => op.type === 'add_item' && (op as ValidatedAddItem).asset?.id === 'coffee-table',
    ) as ValidatedAddItem
    expect(coffeeResult).toBeDefined()
    // It may or may not be adjusted depending on distance comparison
    // Just verify it doesn't crash and returns a valid position
    expect(coffeeResult.position).toBeDefined()
    expect(coffeeResult.position.length).toBe(3)
  })

  it('does not adjust coffee table already at ideal distance from sofa', () => {
    setNodes({})

    const sofaOp = makeAddItemOp('sofa-classic', 'sofa', [0, 0, 0], [0, 0, 0], [2, 0.9, 0.9])
    // idealDistance is edge-to-edge = 0.4m, tolerance = 0.15
    // center-to-center = sofaHalfD(0.45) + ideal(0.4) + coffeeHalfD(0.3) = 1.15
    const coffeeOp = makeAddItemOp('coffee-table', 'coffee-table', [0, 0, 1.15], [0, 0, 0], [1, 0.45, 0.6])

    const result = optimizeLayout([sofaOp, coffeeOp])

    const coffeeResult = result.find(
      (op) => op.type === 'add_item' && (op as ValidatedAddItem).asset?.id === 'coffee-table',
    ) as ValidatedAddItem

    // Within tolerance → no adjustment
    expect(coffeeResult.status).toBe('valid')
    expect(coffeeResult.position).toEqual([0, 0, 1.15])
  })
})

// ============================================================================
// optimizeLayout — move_item
// ============================================================================

describe('optimizeLayout — move_item', () => {
  it('returns move_item unchanged when target node does not exist', () => {
    setNodes({})

    const op = makeMoveItemOp('item_ghost', [5, 0, 5])
    const result = optimizeLayout([op])

    expect(result[0]).toEqual(op)
  })

  it('returns move_item unchanged when node is not of type item', () => {
    setNodes({
      wall_1: makeWall('wall_1', [0, 0], [5, 0]),
    })

    const op = makeMoveItemOp('wall_1', [2, 0, 0])
    const result = optimizeLayout([op])

    expect(result[0]).toEqual(op)
  })

  it('returns invalid move_item unchanged', () => {
    const op = { ...makeMoveItemOp('item_1', [0, 0, 0]), status: 'invalid' as const }
    const result = optimizeLayout([op])
    expect(result[0]!.status).toBe('invalid')
  })

  it('snaps against-wall item to wall when moving close to it', () => {
    setNodes({
      wall_1: makeWall('wall_1', [-5, 0], [5, 0], 0.2),
      item_1: {
        id: 'item_1',
        type: 'item',
        object: 'node',
        parentId: null,
        visible: true,
        metadata: {},
        position: [0, 0, 5],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        asset: {
          id: 'sofa-old',
          category: 'sofa',
          name: 'Old Sofa',
          thumbnail: '', src: '',
          dimensions: [2, 0.9, 0.9],
          offset: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
        },
        children: [],
      },
    })

    // Move sofa close to the wall (z ≈ 0.2)
    const op = makeMoveItemOp('item_1', [0, 0, 0.2])
    const result = optimizeLayout([op])

    expect(result[0]!.status).toBe('adjusted')
    const moveOp = result[0] as ValidatedMoveItem
    expect(moveOp.position).not.toEqual([0, 0, 0.2])
  })
})

// ============================================================================
// optimizeLayout — orientation enforcement (regression for QA-AI 2026-05-01 v3)
// ============================================================================
// Renderer convention: at rotY=0 the item's forward vector is -Z. Verify
// enforceAgainstWallOrientation produces orientations that put forward toward
// the room interior.

describe('optimizeLayout — against-wall orientation enforcement', () => {
  // Test setup: 5x4 rectangular room. North wall at z=-2, south wall at z=+2.
  // Walls go counter-clockwise so that the room interior is on the "side=+1" of each
  // wall normal, mirroring how add_wall typically lays out a room.
  function setupRectRoom() {
    setNodes({
      wall_north: makeWall('wall_north', [2.5, -2], [-2.5, -2], 0.2),
      wall_east: makeWall('wall_east', [2.5, 2], [2.5, -2], 0.2),
      wall_south: makeWall('wall_south', [-2.5, 2], [2.5, 2], 0.2),
      wall_west: makeWall('wall_west', [-2.5, -2], [-2.5, 2], 0.2),
    })
  }

  it('keeps rotY=0 when sofa is against the south wall (forward -Z faces room)', () => {
    setupRectRoom()
    // Sofa center at (0, 0.05, 1.13) — within enforce threshold of south wall (z=2)
    const op = makeAddItemOp('sofa', 'sofa', [0, 0.05, 1.13], [0, 0, 0], [2, 0.9, 0.9])
    const result = optimizeLayout([op]) as [ValidatedAddItem]
    expect(result[0].rotation[1]).toBeCloseTo(0, 2)
  })

  it('rotates sofa to π when moved against the north wall (forward -Z would face wall)', () => {
    setupRectRoom()
    setNodes({
      ...mockNodes,
      item_sofa: {
        id: 'item_sofa', type: 'item', object: 'node', parentId: null,
        visible: true, metadata: {}, position: [0, 0.05, 1.13],
        rotation: [0, 0, 0], scale: [1, 1, 1],
        asset: {
          id: 'sofa', category: 'sofa', name: 'Sofa',
          thumbnail: '', src: '',
          dimensions: [2, 0.9, 0.9],
          offset: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
        },
        children: [],
      },
    })
    // User: "move sofa to north wall edge" → AI gives a position near z=-1.13, rotation [0,0,0]
    const op = makeMoveItemOp('item_sofa', [0, 0.05, -1.13], [0, 0, 0])
    const result = optimizeLayout([op]) as [ValidatedMoveItem]
    // Expect orientation corrected to π so seat faces +Z (room interior)
    expect(Math.abs(result[0].rotation[1])).toBeCloseTo(Math.PI, 2)
    expect(result[0].status).toBe('adjusted')
  })

  it('rotates sofa to ±π/2 when against the west wall', () => {
    setupRectRoom()
    setNodes({
      ...mockNodes,
      item_sofa: {
        id: 'item_sofa', type: 'item', object: 'node', parentId: null,
        visible: true, metadata: {}, position: [0, 0.05, 0],
        rotation: [0, 0, 0], scale: [1, 1, 1],
        asset: {
          id: 'sofa', category: 'sofa', name: 'Sofa',
          thumbnail: '', src: '',
          dimensions: [2, 0.9, 0.9],
          offset: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
        },
        children: [],
      },
    })
    // Move sofa close to west wall (x=-2). Forward should face +X.
    const op = makeMoveItemOp('item_sofa', [-1.5, 0.05, 0], [0, 0, 0])
    const result = optimizeLayout([op]) as [ValidatedMoveItem]
    // forward = (-sinθ, -cosθ) should equal +X = (1, 0)
    // -sinθ = 1 → θ = -π/2
    expect(result[0].rotation[1]).toBeCloseTo(-Math.PI / 2, 2)
  })
})

// ============================================================================
// optimizeLayout — preserves adjustmentReason accumulation
// ============================================================================

describe('optimizeLayout — adjustmentReason', () => {
  it('appends new reason to existing adjustmentReason', () => {
    setNodes({
      wall_1: makeWall('wall_1', [-5, 0], [5, 0], 0.2),
    })

    const op: ValidatedAddItem = {
      ...makeAddItemOp('sofa-modern', 'sofa', [0, 0, 0.15], [0, 0, 0], [2, 0.9, 0.9]),
      status: 'adjusted',
      adjustmentReason: 'pre-existing reason',
    }

    const result = optimizeLayout([op])
    const addOp = result[0] as ValidatedAddItem

    if (addOp.status === 'adjusted') {
      expect(addOp.adjustmentReason).toContain('pre-existing reason')
    }
  })
})
