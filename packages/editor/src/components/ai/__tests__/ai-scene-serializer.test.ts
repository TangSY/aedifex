import { describe, expect, it, vi, beforeEach } from 'vitest'

// ============================================================================
// Mocks — must be declared before importing the module under test
// ============================================================================

const mockNodes: Record<string, unknown> = {}
const mockSelection = { levelId: '' as string | null, zoneId: null as string | null, selectedIds: [] as string[] }

vi.mock('@aedifex/core', () => ({
  useScene: {
    getState: () => ({ nodes: mockNodes }),
  },
}))

vi.mock('@aedifex/viewer', () => ({
  useViewer: {
    getState: () => ({ selection: mockSelection }),
  },
}))

import { serializeSceneContext, formatSceneContextForPrompt, invalidateSceneCache } from '../ai-scene-serializer'

// ============================================================================
// Helpers
// ============================================================================

function setNodes(nodes: Record<string, unknown>) {
  for (const key of Object.keys(mockNodes)) delete mockNodes[key]
  Object.assign(mockNodes, nodes)
}

function makeLevel(id = 'level_1', childIds: string[] = []) {
  return {
    id,
    type: 'level',
    object: 'node',
    parentId: null,
    visible: true,
    metadata: {},
    children: childIds,
    level: 0,
  }
}

function makeWall(
  id: string,
  start: [number, number],
  end: [number, number],
  opts?: { thickness?: number; children?: string[] },
) {
  return {
    id,
    type: 'wall',
    object: 'node',
    parentId: 'level_1',
    visible: true,
    metadata: {},
    start,
    end,
    thickness: opts?.thickness ?? 0.2,
    children: opts?.children ?? [],
    frontSide: 'unknown',
    backSide: 'unknown',
  }
}

function makeItem(id: string, position: [number, number, number], opts?: { category?: string }) {
  return {
    id,
    type: 'item',
    object: 'node',
    parentId: 'level_1',
    visible: true,
    metadata: {},
    position,
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    asset: {
      id: 'sofa-modern',
      category: opts?.category ?? 'furniture',
      name: 'Sofa',
      thumbnail: '',
      src: '',
      dimensions: [2.2, 0.9, 0.9],
      offset: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    children: [],
  }
}

function makeZone(id: string, name: string, polygon: [number, number][]) {
  return {
    id,
    type: 'zone',
    object: 'node',
    parentId: 'level_1',
    visible: true,
    metadata: {},
    name,
    polygon,
    color: '#3b82f6',
  }
}

function makeDoor(id: string, wallId: string, localX: number) {
  return {
    id,
    type: 'door',
    object: 'node',
    parentId: wallId,
    visible: true,
    metadata: {},
    position: [localX, 1.05, 0],
    rotation: [0, 0, 0],
    width: 0.9,
    height: 2.1,
    wallId,
    hingesSide: 'left',
    swingDirection: 'inward',
  }
}

function makeWindow(id: string, wallId: string, localX: number) {
  return {
    id,
    type: 'window',
    object: 'node',
    parentId: wallId,
    visible: true,
    metadata: {},
    position: [localX, 1.2, 0],
    rotation: [0, 0, 0],
    width: 1.5,
    height: 1.5,
    wallId,
  }
}

// ============================================================================
// Reset mocks before each test
// ============================================================================

beforeEach(() => {
  for (const key of Object.keys(mockNodes)) delete mockNodes[key]
  mockSelection.levelId = ''
  mockSelection.zoneId = null
  mockSelection.selectedIds = []
  invalidateSceneCache()
})

// ============================================================================
// serializeSceneContext
// ============================================================================

describe('serializeSceneContext — empty / no level selected', () => {
  it('returns empty context when no levelId is selected', () => {
    mockSelection.levelId = null as any
    const ctx = serializeSceneContext()

    expect(ctx.levelId).toBe('')
    expect(ctx.items).toEqual([])
    expect(ctx.walls).toEqual([])
    expect(ctx.zones).toEqual([])
    expect(ctx.wallCount).toBe(0)
    expect(ctx.zoneCount).toBe(0)
  })

  it('returns empty context when levelId is empty string', () => {
    mockSelection.levelId = ''
    const ctx = serializeSceneContext()

    expect(ctx.items).toEqual([])
    expect(ctx.walls).toEqual([])
  })

  it('returns empty context when level node does not exist', () => {
    mockSelection.levelId = 'level_missing'
    const ctx = serializeSceneContext()

    expect(ctx.walls).toEqual([])
    expect(ctx.items).toEqual([])
  })
})

describe('serializeSceneContext — walls', () => {
  it('serializes wall start/end/thickness/length', () => {
    mockSelection.levelId = 'level_1'
    const wall = makeWall('wall_1', [0, 0], [4, 0])
    setNodes({
      level_1: makeLevel('level_1', ['wall_1']),
      wall_1: wall,
    })

    const ctx = serializeSceneContext()

    expect(ctx.wallCount).toBe(1)
    expect(ctx.walls).toHaveLength(1)

    const w = ctx.walls[0]!
    expect(w.id).toBe('wall_1')
    expect(w.start).toEqual([0, 0])
    expect(w.end).toEqual([4, 0])
    expect(w.thickness).toBe(0.2)
    expect(w.length).toBeCloseTo(4)
  })

  it('uses default thickness 0.2 when wall.thickness is undefined', () => {
    mockSelection.levelId = 'level_1'
    const wall = { ...makeWall('wall_1', [0, 0], [3, 0]), thickness: undefined }
    setNodes({
      level_1: makeLevel('level_1', ['wall_1']),
      wall_1: wall,
    })

    const ctx = serializeSceneContext()
    expect(ctx.walls[0]!.thickness).toBe(0.2)
  })

  it('calculates diagonal wall length correctly', () => {
    mockSelection.levelId = 'level_1'
    // 3-4-5 right triangle
    setNodes({
      level_1: makeLevel('level_1', ['wall_diag']),
      wall_diag: makeWall('wall_diag', [0, 0], [3, 4]),
    })

    const ctx = serializeSceneContext()
    expect(ctx.walls[0]!.length).toBeCloseTo(5)
  })
})

describe('serializeSceneContext — wall children (doors/windows)', () => {
  it('includes doors in wall.children', () => {
    mockSelection.levelId = 'level_1'
    const door = makeDoor('door_1', 'wall_1', 1.5)
    setNodes({
      level_1: makeLevel('level_1', ['wall_1']),
      wall_1: makeWall('wall_1', [0, 0], [5, 0], { children: ['door_1'] }),
      door_1: door,
    })

    const ctx = serializeSceneContext()
    const wall = ctx.walls[0]!
    expect(wall.children).toHaveLength(1)
    expect(wall.children![0]!.type).toBe('door')
    expect(wall.children![0]!.id).toBe('door_1')
    expect(wall.children![0]!.localX).toBeCloseTo(1.5)
    expect(wall.children![0]!.width).toBeCloseTo(0.9)
  })

  it('includes windows in wall.children', () => {
    mockSelection.levelId = 'level_1'
    const win = makeWindow('win_1', 'wall_1', 2.0)
    setNodes({
      level_1: makeLevel('level_1', ['wall_1']),
      wall_1: makeWall('wall_1', [0, 0], [5, 0], { children: ['win_1'] }),
      win_1: win,
    })

    const ctx = serializeSceneContext()
    const wall = ctx.walls[0]!
    expect(wall.children).toHaveLength(1)
    expect(wall.children![0]!.type).toBe('window')
    expect(wall.children![0]!.width).toBeCloseTo(1.5)
  })

  it('includes both door and window on same wall', () => {
    mockSelection.levelId = 'level_1'
    setNodes({
      level_1: makeLevel('level_1', ['wall_1']),
      wall_1: makeWall('wall_1', [0, 0], [6, 0], { children: ['door_1', 'win_1'] }),
      door_1: makeDoor('door_1', 'wall_1', 1.0),
      win_1: makeWindow('win_1', 'wall_1', 4.0),
    })

    const ctx = serializeSceneContext()
    expect(ctx.walls[0]!.children).toHaveLength(2)
  })
})

describe('serializeSceneContext — items', () => {
  it('serializes item position/rotation/dimensions/category', () => {
    mockSelection.levelId = 'level_1'
    setNodes({
      level_1: makeLevel('level_1', ['item_1']),
      item_1: makeItem('item_1', [2, 0, 3]),
    })

    const ctx = serializeSceneContext()
    expect(ctx.items).toHaveLength(1)

    const item = ctx.items[0]!
    expect(item.id).toBe('item_1')
    expect(item.position).toEqual([2, 0, 3])
    expect(item.category).toBe('furniture')
    expect(item.dimensions).toEqual([2.2, 0.9, 0.9])
    expect(item.rotationY).toBe(0)
  })

  it('uses asset.name when node.name is undefined', () => {
    mockSelection.levelId = 'level_1'
    const item = { ...makeItem('item_1', [0, 0, 0]), name: undefined }
    setNodes({
      level_1: makeLevel('level_1', ['item_1']),
      item_1: item,
    })

    const ctx = serializeSceneContext()
    expect(ctx.items[0]!.name).toBe('Sofa')
  })
})

describe('serializeSceneContext — zones', () => {
  it('serializes zone polygon/bounds/name', () => {
    mockSelection.levelId = 'level_1'
    setNodes({
      level_1: makeLevel('level_1', ['zone_1']),
      zone_1: makeZone('zone_1', 'Living Room', [[0, 0], [4, 0], [4, 3], [0, 3]]),
    })

    const ctx = serializeSceneContext()
    expect(ctx.zoneCount).toBe(1)
    expect(ctx.zones).toHaveLength(1)

    const z = ctx.zones[0]!
    expect(z.id).toBe('zone_1')
    expect(z.name).toBe('Living Room')
    expect(z.polygon).toHaveLength(4)
    expect(z.bounds.min).toEqual([0, 0])
    expect(z.bounds.max).toEqual([4, 3])
  })

  it('sets activeZone when zone is selected', () => {
    mockSelection.levelId = 'level_1'
    mockSelection.zoneId = 'zone_1'
    setNodes({
      level_1: makeLevel('level_1', ['zone_1']),
      zone_1: makeZone('zone_1', 'Bedroom', [[0, 0], [3, 0], [3, 3], [0, 3]]),
    })

    const ctx = serializeSceneContext()
    expect(ctx.activeZone).toBeDefined()
    expect(ctx.activeZone!.id).toBe('zone_1')
    expect(ctx.activeZone!.name).toBe('Bedroom')
  })
})

// ============================================================================
// formatSceneContextForPrompt
// ============================================================================

describe('formatSceneContextForPrompt', () => {
  it('returns string with level ID', () => {
    const ctx = serializeSceneContext()
    // levelId is '' since nothing is set up
    const output = formatSceneContextForPrompt({ ...ctx, levelId: 'level_test' })
    expect(output).toContain('level_test')
  })

  it('shows 0 walls and 0 zones for empty scene', () => {
    const ctx = {
      levelId: 'level_1',
      items: [],
      walls: [],
      zones: [],
      wallCount: 0,
      zoneCount: 0,
      levels: [],
      ceilings: [],
      roofs: [],
      slabs: [],
      stairs: [],
      buildings: [],
    }
    const output = formatSceneContextForPrompt(ctx)
    expect(output).toContain('0 walls')
    expect(output).toContain('0 zones')
  })

  it('marks longest wall as [LONGEST]', () => {
    const ctx = {
      levelId: 'level_1',
      items: [],
      zones: [],
      wallCount: 2,
      zoneCount: 0,
      levels: [],
      ceilings: [],
      roofs: [],
      slabs: [],
      walls: [
        { id: 'wall_short', start: [0, 0] as [number, number], end: [2, 0] as [number, number], thickness: 0.2, length: 2 },
        { id: 'wall_long', start: [0, 0] as [number, number], end: [6, 0] as [number, number], thickness: 0.2, length: 6 },
      ],
      stairs: [],
      buildings: [],
    }
    const output = formatSceneContextForPrompt(ctx)
    expect(output).toContain('[LONGEST]')
    expect(output).toContain('wall_long')
    // short wall should not have [LONGEST]
    const lines = output.split('\n')
    const shortWallLine = lines.find((l) => l.includes('wall_short'))
    expect(shortWallLine).not.toContain('[LONGEST]')
  })

  it('shows zone size description', () => {
    const ctx = {
      levelId: 'level_1',
      items: [],
      walls: [],
      zones: [
        {
          id: 'zone_1',
          name: 'Living Room',
          polygon: [[0, 0], [5, 0], [5, 4], [0, 4]] as [number, number][],
          bounds: { min: [0, 0] as [number, number], max: [5, 4] as [number, number] },
        },
      ],
      wallCount: 0,
      zoneCount: 1,
      levels: [],
      ceilings: [],
      roofs: [],
      slabs: [],
      stairs: [],
      buildings: [],
    }
    const output = formatSceneContextForPrompt(ctx)
    expect(output).toContain('Living Room')
    expect(output).toContain('5.00m')
    // 5x4 area
    expect(output).toContain('20.0m²')
  })

  it('shows quadrant analysis for zones with items', () => {
    const ctx = {
      levelId: 'level_1',
      walls: [],
      wallCount: 0,
      zoneCount: 1,
      levels: [],
      ceilings: [],
      roofs: [],
      slabs: [],
      zones: [
        {
          id: 'zone_1',
          name: 'Room',
          polygon: [[0, 0], [4, 0], [4, 4], [0, 4]] as [number, number][],
          bounds: { min: [0, 0] as [number, number], max: [4, 4] as [number, number] },
        },
      ],
      items: [
        {
          id: 'item_1',
          name: 'Sofa',
          catalogSlug: 'sofa',
          position: [1, 0, 1] as [number, number, number],
          rotationY: 0,
          dimensions: [1, 1, 1] as [number, number, number],
          category: 'furniture',
        },
      ],
      stairs: [],
      buildings: [],
    }
    const output = formatSceneContextForPrompt(ctx)
    expect(output).toContain('top-left')
    expect(output).toContain('EMPTY')
  })

  it('shows wall orientation descriptions', () => {
    const ctx = {
      levelId: 'level_1',
      items: [],
      zones: [],
      wallCount: 1,
      zoneCount: 0,
      levels: [],
      ceilings: [],
      roofs: [],
      slabs: [],
      walls: [
        {
          id: 'wall_h',
          start: [0, 0] as [number, number],
          end: [10, 0] as [number, number],
          thickness: 0.2,
          length: 10,
        },
      ],
      stairs: [],
      buildings: [],
    }
    const output = formatSceneContextForPrompt(ctx)
    expect(output).toContain('horizontal')
  })

  it('includes (empty — no items placed yet) when items list is empty', () => {
    const ctx = {
      levelId: 'level_1',
      items: [],
      walls: [],
      zones: [],
      wallCount: 0,
      zoneCount: 0,
      levels: [],
      ceilings: [],
      roofs: [],
      slabs: [],
      stairs: [],
      buildings: [],
    }
    const output = formatSceneContextForPrompt(ctx)
    expect(output).toContain('empty')
  })
})
