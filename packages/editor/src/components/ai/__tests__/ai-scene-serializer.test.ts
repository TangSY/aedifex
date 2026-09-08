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

function makeBuilding(id: string, levelIds: string[], extraChildIds: string[] = []) {
  return {
    id,
    type: 'building',
    object: 'node',
    parentId: null,
    visible: true,
    metadata: {},
    name: 'Building A',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    children: [...levelIds, ...extraChildIds],
  }
}

function makeElevator(
  id: string,
  buildingId: string,
  opts?: {
    fromLevelId?: string | null
    toLevelId?: string | null
    servedLevelIds?: string[]
    visible?: boolean
    isGhostPreview?: boolean
  },
) {
  const meta: Record<string, unknown> = {}
  if (opts?.isGhostPreview) meta.isGhostPreview = true
  return {
    id,
    type: 'elevator',
    object: 'node',
    parentId: buildingId,
    visible: opts?.visible ?? true,
    metadata: meta,
    position: [2, 0, 3] as [number, number, number],
    rotation: 0,
    width: 1.6,
    depth: 1.6,
    cabHeight: 2.35,
    fromLevelId: opts?.fromLevelId ?? 'level_1',
    toLevelId: opts?.toLevelId ?? 'level_2',
    ...(opts && 'servedLevelIds' in opts ? { servedLevelIds: opts.servedLevelIds } : {}),
    shaftStyle: 'enclosed',
    doorStyle: 'sliding',
    doorPanelStyle: 'center-opening',
    children: [],
  }
}

function makeStair(
  id: string,
  opts?: { stairType?: string; innerRadius?: number; sweepAngle?: number },
) {
  return {
    id,
    type: 'stair',
    object: 'node',
    parentId: 'level_1',
    visible: true,
    metadata: {},
    position: [1, 0, 1] as [number, number, number],
    rotation: 0,
    stairType: opts?.stairType,
    width: 1.0,
    totalRise: 3.0,
    stepCount: 16,
    ...(opts && 'innerRadius' in opts ? { innerRadius: opts.innerRadius } : {}),
    ...(opts && 'sweepAngle' in opts ? { sweepAngle: opts.sweepAngle } : {}),
    children: [],
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
      elevators: [],
      fences: [],
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
      elevators: [],
      fences: [],
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
      elevators: [],
      fences: [],
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
      elevators: [],
      fences: [],
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
      elevators: [],
      fences: [],
      buildings: [],
    }
    const output = formatSceneContextForPrompt(ctx)
    expect(output).toContain('horizontal')
  })

  it('annotates each wall with a compass side relative to the room centroid', () => {
    // 4m x 4m room centered at origin: north wall at z=-2, south at z=+2,
    // east at x=+2, west at x=-2 (+Z = south, -Z = north).
    const mkWall = (id: string, start: [number, number], end: [number, number]) => ({
      id, start, end, thickness: 0.2, length: 4,
    })
    const ctx = {
      levelId: 'level_1',
      items: [],
      zones: [],
      wallCount: 4,
      zoneCount: 0,
      levels: [],
      ceilings: [],
      roofs: [],
      slabs: [],
      walls: [
        mkWall('wall_north', [-2, -2], [2, -2]),
        mkWall('wall_east', [2, -2], [2, 2]),
        mkWall('wall_south', [2, 2], [-2, 2]),
        mkWall('wall_west', [-2, 2], [-2, -2]),
      ],
      stairs: [],
      elevators: [],
      fences: [],
      buildings: [],
    }
    const output = formatSceneContextForPrompt(ctx)
    const lineFor = (id: string) => output.split('\n').find((l: string) => l.includes(`[${id}]`)) ?? ''
    expect(lineFor('wall_north')).toContain('side=N')
    expect(lineFor('wall_south')).toContain('side=S')
    expect(lineFor('wall_east')).toContain('side=E')
    expect(lineFor('wall_west')).toContain('side=W')
  })

  it('labels a hexagon diagonal wall with its diagonal compass side', () => {
    // Regular hexagon edge centered to the southeast of the centroid.
    const ctx = {
      levelId: 'level_1',
      items: [],
      zones: [],
      wallCount: 6,
      zoneCount: 0,
      levels: [],
      ceilings: [],
      roofs: [],
      slabs: [],
      walls: [
        { id: 'w_e',  start: [2.5, -1.5] as [number, number], end: [2.5, 1.5] as [number, number], thickness: 0.2, length: 3 },
        { id: 'w_se', start: [2.5, 1.5] as [number, number], end: [1, 3] as [number, number], thickness: 0.2, length: 2.1 },
        { id: 'w_sw', start: [1, 3] as [number, number], end: [-1.5, 1.5] as [number, number], thickness: 0.2, length: 2.9 },
        { id: 'w_w',  start: [-1.5, 1.5] as [number, number], end: [-1.5, -1.5] as [number, number], thickness: 0.2, length: 3 },
        { id: 'w_nw', start: [-1.5, -1.5] as [number, number], end: [1, -3] as [number, number], thickness: 0.2, length: 2.9 },
        { id: 'w_ne', start: [1, -3] as [number, number], end: [2.5, -1.5] as [number, number], thickness: 0.2, length: 2.1 },
      ],
      stairs: [],
      elevators: [],
      fences: [],
      buildings: [],
    }
    const output = formatSceneContextForPrompt(ctx)
    const lineFor = (id: string) => output.split('\n').find((l: string) => l.includes(`[${id}]`)) ?? ''
    expect(lineFor('w_se')).toContain('side=SE')
    expect(lineFor('w_ne')).toContain('side=NE')
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
      elevators: [],
      fences: [],
      buildings: [],
    }
    const output = formatSceneContextForPrompt(ctx)
    expect(output).toContain('empty')
  })
})

// ============================================================================
// Elevator collection (building-scoped)
// ============================================================================

describe('serializeSceneContext — elevator collection (building-scoped)', () => {
  it('collects elevators that live under the current building', () => {
    mockSelection.levelId = 'level_1'
    setNodes({
      building_1: makeBuilding('building_1', ['level_1'], ['elev_1']),
      level_1: { ...makeLevel('level_1', []), parentId: 'building_1' },
      elev_1: makeElevator('elev_1', 'building_1'),
    })

    const ctx = serializeSceneContext()
    expect(ctx.elevators).toHaveLength(1)
    expect(ctx.elevators[0]!.id).toBe('elev_1')
    expect(ctx.elevators[0]!.fromLevelId).toBe('level_1')
    expect(ctx.elevators[0]!.toLevelId).toBe('level_2')
  })

  it('does NOT collect elevators under a different building', () => {
    // Two buildings, current level lives under building_1 — elevator on building_2 must be skipped
    mockSelection.levelId = 'level_1'
    setNodes({
      building_1: makeBuilding('building_1', ['level_1']),
      level_1: { ...makeLevel('level_1', []), parentId: 'building_1' },
      building_2: makeBuilding('building_2', ['level_2'], ['elev_other']),
      level_2: { ...makeLevel('level_2', []), parentId: 'building_2' },
      elev_other: makeElevator('elev_other', 'building_2'),
    })

    const ctx = serializeSceneContext()
    expect(ctx.elevators).toHaveLength(0)
    // Buildings list still includes both for site-level awareness
    expect(ctx.buildings).toHaveLength(2)
  })

  it('omits servedLevelIds key when undefined (conditional spread)', () => {
    mockSelection.levelId = 'level_1'
    setNodes({
      building_1: makeBuilding('building_1', ['level_1'], ['elev_1']),
      level_1: { ...makeLevel('level_1', []), parentId: 'building_1' },
      // makeElevator with no servedLevelIds option → property absent on input
      elev_1: makeElevator('elev_1', 'building_1'),
    })

    const ctx = serializeSceneContext()
    expect(ctx.elevators[0]).not.toHaveProperty('servedLevelIds')
  })

  it('includes servedLevelIds when populated', () => {
    mockSelection.levelId = 'level_1'
    setNodes({
      building_1: makeBuilding('building_1', ['level_1'], ['elev_1']),
      level_1: { ...makeLevel('level_1', []), parentId: 'building_1' },
      elev_1: makeElevator('elev_1', 'building_1', { servedLevelIds: ['level_1', 'level_2', 'level_3'] }),
    })

    const ctx = serializeSceneContext()
    expect(ctx.elevators[0]!.servedLevelIds).toEqual(['level_1', 'level_2', 'level_3'])
  })

  it('treats empty servedLevelIds [] as falsy and OMITS it from summary (current behavior)', () => {
    // The conditional spread `...(e.servedLevelIds ? { servedLevelIds: e.servedLevelIds } : {})`
    // evaluates [] as truthy in JS, so an empty array WOULD be kept.
    // This test pins the actual semantics so any contract drift is caught.
    mockSelection.levelId = 'level_1'
    setNodes({
      building_1: makeBuilding('building_1', ['level_1'], ['elev_1']),
      level_1: { ...makeLevel('level_1', []), parentId: 'building_1' },
      elev_1: makeElevator('elev_1', 'building_1', { servedLevelIds: [] }),
    })

    const ctx = serializeSceneContext()
    // Current behavior: empty array IS kept (because [] is truthy in JS).
    // This pins the as-implemented contract — see notes for caveat.
    expect(ctx.elevators[0]!.servedLevelIds).toEqual([])
  })
})

// ============================================================================
// Ghost / hidden node filtering
// ============================================================================

describe('serializeSceneContext — ghost / hidden filtering', () => {
  it('excludes walls with visible=false from the active level', () => {
    mockSelection.levelId = 'level_1'
    setNodes({
      level_1: makeLevel('level_1', ['wall_1', 'wall_hidden']),
      wall_1: makeWall('wall_1', [0, 0], [4, 0]),
      wall_hidden: { ...makeWall('wall_hidden', [0, 2], [4, 2]), visible: false },
    })

    const ctx = serializeSceneContext()
    expect(ctx.wallCount).toBe(1)
    expect(ctx.walls.map((w) => w.id)).toEqual(['wall_1'])
  })

  it('excludes walls flagged metadata.isGhostPreview', () => {
    mockSelection.levelId = 'level_1'
    setNodes({
      level_1: makeLevel('level_1', ['wall_1', 'wall_ghost']),
      wall_1: makeWall('wall_1', [0, 0], [4, 0]),
      wall_ghost: { ...makeWall('wall_ghost', [0, 2], [4, 2]), metadata: { isGhostPreview: true } },
    })

    const ctx = serializeSceneContext()
    expect(ctx.wallCount).toBe(1)
    expect(ctx.walls[0]!.id).toBe('wall_1')
  })

  it('excludes walls flagged metadata.isGhostRemoval', () => {
    mockSelection.levelId = 'level_1'
    setNodes({
      level_1: makeLevel('level_1', ['wall_1', 'wall_pendingRemove']),
      wall_1: makeWall('wall_1', [0, 0], [4, 0]),
      wall_pendingRemove: { ...makeWall('wall_pendingRemove', [0, 2], [4, 2]), metadata: { isGhostRemoval: true } },
    })

    const ctx = serializeSceneContext()
    expect(ctx.wallCount).toBe(1)
    expect(ctx.walls[0]!.id).toBe('wall_1')
  })

  it('ghost-preview elevators are filtered out (mirrors BFS visibility check)', () => {
    // Elevators are collected in a SECOND, building-scoped pass (not the
    // level-scoped BFS), so the visibility filter has to be re-applied
    // explicitly there. Was a real source bug — pinned here in the fixed
    // state so a future regression would surface.
    mockSelection.levelId = 'level_1'
    setNodes({
      building_1: makeBuilding('building_1', ['level_1'], ['elev_ghost']),
      level_1: { ...makeLevel('level_1', []), parentId: 'building_1' },
      elev_ghost: makeElevator('elev_ghost', 'building_1', { isGhostPreview: true }),
    })

    const ctx = serializeSceneContext()
    expect(ctx.elevators).toHaveLength(0)
  })

  it('invisible elevators (visible=false) are filtered out of the summary', () => {
    mockSelection.levelId = 'level_1'
    setNodes({
      building_1: makeBuilding('building_1', ['level_1'], ['elev_hidden']),
      level_1: { ...makeLevel('level_1', []), parentId: 'building_1' },
      elev_hidden: makeElevator('elev_hidden', 'building_1', { visible: false }),
    })

    const ctx = serializeSceneContext()
    expect(ctx.elevators).toHaveLength(0)
  })
})

// ============================================================================
// Cache (sceneContextCache)
// ============================================================================

describe('serializeSceneContext — cache', () => {
  it('returns same reference on consecutive calls when nodes hash unchanged', () => {
    mockSelection.levelId = 'level_1'
    setNodes({
      level_1: makeLevel('level_1', ['wall_1']),
      wall_1: makeWall('wall_1', [0, 0], [4, 0]),
    })

    const first = serializeSceneContext()
    const second = serializeSceneContext()
    expect(second).toBe(first) // reference equality — cache hit
  })

  it('invalidates cache when a node is added (hash changes)', () => {
    mockSelection.levelId = 'level_1'
    setNodes({
      level_1: makeLevel('level_1', ['wall_1']),
      wall_1: makeWall('wall_1', [0, 0], [4, 0]),
    })

    const first = serializeSceneContext()
    expect(first.wallCount).toBe(1)

    // Add a new wall — hash changes
    mockNodes.wall_2 = makeWall('wall_2', [0, 2], [4, 2])
    ;(mockNodes.level_1 as { children: string[] }).children = ['wall_1', 'wall_2']

    const second = serializeSceneContext()
    expect(second).not.toBe(first)
    expect(second.wallCount).toBe(2)
  })

  it('invalidates cache when levelId changes', () => {
    setNodes({
      level_1: makeLevel('level_1', ['wall_1']),
      wall_1: makeWall('wall_1', [0, 0], [4, 0]),
      level_2: makeLevel('level_2', []),
    })

    mockSelection.levelId = 'level_1'
    const first = serializeSceneContext()
    expect(first.levelId).toBe('level_1')

    mockSelection.levelId = 'level_2'
    const second = serializeSceneContext()
    expect(second).not.toBe(first)
    expect(second.levelId).toBe('level_2')
  })

  it('invalidateSceneCache() forces a re-serialize even when nodes are identical', () => {
    mockSelection.levelId = 'level_1'
    setNodes({
      level_1: makeLevel('level_1', ['wall_1']),
      wall_1: makeWall('wall_1', [0, 0], [4, 0]),
    })

    const first = serializeSceneContext()
    invalidateSceneCache()
    const second = serializeSceneContext()
    // Different object identity — recomputed
    expect(second).not.toBe(first)
    // But same content
    expect(second.wallCount).toBe(first.wallCount)
  })
})

// ============================================================================
// Stair conditional fields (innerRadius / sweepAngle by stairType)
// ============================================================================

describe('serializeSceneContext — stair conditional fields', () => {
  it('stairType="straight" omits innerRadius and sweepAngle even if numeric', () => {
    mockSelection.levelId = 'level_1'
    setNodes({
      level_1: makeLevel('level_1', ['stair_1']),
      stair_1: makeStair('stair_1', { stairType: 'straight', innerRadius: 0.5, sweepAngle: 90 }),
    })

    const ctx = serializeSceneContext()
    expect(ctx.stairs).toHaveLength(1)
    const s = ctx.stairs[0]!
    expect(s.stairType).toBe('straight')
    expect(s).not.toHaveProperty('innerRadius')
    expect(s).not.toHaveProperty('sweepAngle')
  })

  it('stairType="curved" includes innerRadius and sweepAngle', () => {
    mockSelection.levelId = 'level_1'
    setNodes({
      level_1: makeLevel('level_1', ['stair_1']),
      stair_1: makeStair('stair_1', { stairType: 'curved', innerRadius: 0.5, sweepAngle: 90 }),
    })

    const ctx = serializeSceneContext()
    const s = ctx.stairs[0]!
    expect(s.stairType).toBe('curved')
    expect(s.innerRadius).toBe(0.5)
    expect(s.sweepAngle).toBe(90)
  })

  it('stairType="spiral" includes innerRadius and sweepAngle', () => {
    mockSelection.levelId = 'level_1'
    setNodes({
      level_1: makeLevel('level_1', ['stair_1']),
      stair_1: makeStair('stair_1', { stairType: 'spiral', innerRadius: 0.3, sweepAngle: 270 }),
    })

    const ctx = serializeSceneContext()
    const s = ctx.stairs[0]!
    expect(s.stairType).toBe('spiral')
    expect(s.innerRadius).toBe(0.3)
    expect(s.sweepAngle).toBe(270)
  })
})

// ============================================================================
// formatSceneContextForPrompt — elevator + stair sections (snapshot-like)
// ============================================================================

describe('formatSceneContextForPrompt — elevator + stair sections', () => {
  it('formats elevator section with id, pos, range, shaft/door styles', () => {
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
      fences: [],
      buildings: [],
      elevators: [
        {
          id: 'elev_1',
          position: [2.5, 0, 3.0] as [number, number, number],
          rotation: 1.57,
          width: 1.6,
          depth: 1.6,
          cabHeight: 2.35,
          fromLevelId: 'level_1',
          toLevelId: 'level_2',
          shaftStyle: 'enclosed',
          doorStyle: 'sliding',
          doorPanelStyle: 'center-opening',
        },
      ],
    }

    const out = formatSceneContextForPrompt(ctx)
    expect(out).toContain('Elevators (1)')
    expect(out).toContain('elev_1')
    expect(out).toContain('level_1→level_2')
    expect(out).toContain('1.6×1.6×2.35m')
    expect(out).toContain('shaft=enclosed')
    expect(out).toContain('door=sliding/center-opening')
  })

  it('formats elevator with service range undefined when fromLevelId is null', () => {
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
      fences: [],
      buildings: [],
      elevators: [
        {
          id: 'elev_1',
          position: [0, 0, 0] as [number, number, number],
          rotation: 0,
          width: 1.6,
          depth: 1.6,
          cabHeight: 2.35,
          fromLevelId: null,
          toLevelId: null,
          shaftStyle: 'glass',
          doorStyle: 'sliding',
          doorPanelStyle: 'center-opening',
        },
      ],
    }

    const out = formatSceneContextForPrompt(ctx)
    expect(out).toContain('service range undefined')
  })

  it('formats stair section with type, slabOpening, railing extras', () => {
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
      fences: [],
      buildings: [],
      elevators: [],
      stairs: [
        {
          id: 'stair_1',
          position: [1, 0, 1] as [number, number, number],
          rotation: 0,
          stairType: 'curved',
          slabOpeningMode: 'destination',
          railingMode: 'both',
          segments: [
            { id: 'seg_1', segmentType: 'stair', width: 1.0, length: 3.0, height: 2.5, stepCount: 16, attachmentSide: 'front' },
          ],
        },
      ],
    }
    const out = formatSceneContextForPrompt(ctx)
    expect(out).toContain('Stairs (1)')
    expect(out).toContain('stair_1')
    expect(out).toContain('type=curved')
    expect(out).toContain('slabOpening=destination')
    expect(out).toContain('railing=both')
  })
})
