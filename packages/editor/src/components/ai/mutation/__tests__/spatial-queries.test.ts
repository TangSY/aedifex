import { beforeEach, describe, expect, it, vi } from 'vitest'

// ============================================================================
// Mock @aedifex/core and @aedifex/viewer to avoid loading three.js.
// useScene exposes a single `nodes` map that tests mutate directly.
// vi.mock is hoisted, so referenced bindings must be valid at hoist time.
// ============================================================================

const mockNodes: Record<string, any> = {}
const mockSelectionLevelId = { value: null as string | null }

vi.mock('@aedifex/core', () => ({
  useScene: { getState: () => ({ nodes: mockNodes }) },
  pointInPolygon: () => false,
}))

vi.mock('@aedifex/viewer', () => ({
  useViewer: {
    getState: () => ({ selection: { levelId: mockSelectionLevelId.value } }),
  },
}))

import {
  getLevelHeightContext,
  getMaxWallThickness,
  getWallsForLevel,
  getZonesForLevel,
} from '../spatial-queries'

beforeEach(() => {
  for (const key of Object.keys(mockNodes)) delete mockNodes[key]
  mockSelectionLevelId.value = null
})

function makeLevel(id: string, children: string[]) {
  mockNodes[id] = {
    id,
    type: 'level',
    visible: true,
    metadata: {},
    children,
    parentId: null,
  }
}

function makeWall(
  id: string,
  parentId: string,
  opts: { visible?: boolean; metadata?: Record<string, unknown>; height?: number; thickness?: number } = {},
) {
  mockNodes[id] = {
    id,
    type: 'wall',
    visible: opts.visible ?? true,
    metadata: opts.metadata ?? {},
    parentId,
    children: [],
    start: [0, 0],
    end: [3, 0],
    height: opts.height ?? 2.5,
    thickness: opts.thickness ?? 0.2,
  }
}

function makeZone(
  id: string,
  parentId: string,
  opts: { metadata?: Record<string, unknown>; visible?: boolean } = {},
) {
  mockNodes[id] = {
    id,
    type: 'zone',
    visible: opts.visible ?? true,
    metadata: opts.metadata ?? {},
    parentId,
    children: [],
  }
}

function makeCeiling(
  id: string,
  parentId: string,
  opts: { metadata?: Record<string, unknown>; visible?: boolean; height?: number } = {},
) {
  mockNodes[id] = {
    id,
    type: 'ceiling',
    visible: opts.visible ?? true,
    metadata: opts.metadata ?? {},
    parentId,
    children: [],
    height: opts.height ?? 2.5,
    polygon: [
      [0, 0],
      [5, 0],
      [5, 5],
    ],
  }
}

// ============================================================================
// getWallsForLevel — ghost filter regression
// ============================================================================

describe('getWallsForLevel ghost filter', () => {
  it('excludes walls flagged isGhostPreview (mid-batch ghost-added wall)', () => {
    makeLevel('lvl', ['wall_real', 'wall_ghost'])
    makeWall('wall_real', 'lvl')
    makeWall('wall_ghost', 'lvl', { metadata: { isGhostPreview: true } })

    const walls = getWallsForLevel('lvl')

    expect(walls.map((w) => w.id)).toEqual(['wall_real'])
  })

  it('excludes walls flagged isGhostRemoval (pending delete)', () => {
    makeLevel('lvl', ['wall_real', 'wall_pending_remove'])
    makeWall('wall_real', 'lvl')
    makeWall('wall_pending_remove', 'lvl', {
      visible: false,
      metadata: { isGhostRemoval: true },
    })

    const walls = getWallsForLevel('lvl')

    expect(walls.map((w) => w.id)).toEqual(['wall_real'])
  })

  it('excludes walls with visible=false even without ghost metadata', () => {
    makeLevel('lvl', ['wall_real', 'wall_hidden'])
    makeWall('wall_real', 'lvl')
    makeWall('wall_hidden', 'lvl', { visible: false })

    const walls = getWallsForLevel('lvl')

    expect(walls.map((w) => w.id)).toEqual(['wall_real'])
  })

  it('keeps walls with isTransient flag alone (an in-progress update preview)', () => {
    // applyGhostPreview for update_wall sets isTransient but NOT isGhostPreview.
    // The wall is real and being modified — it must still appear in queries.
    makeLevel('lvl', ['wall_updating'])
    makeWall('wall_updating', 'lvl', { metadata: { isTransient: true } })

    const walls = getWallsForLevel('lvl')

    expect(walls.map((w) => w.id)).toEqual(['wall_updating'])
  })
})

// ============================================================================
// Downstream consumers must inherit the filter
// ============================================================================

describe('getMaxWallThickness inherits ghost filter', () => {
  it('ignores ghost wall thickness when computing max', () => {
    makeLevel('lvl', ['wall_thin', 'wall_ghost_thick'])
    makeWall('wall_thin', 'lvl', { thickness: 0.15 })
    makeWall('wall_ghost_thick', 'lvl', {
      thickness: 1.5,
      metadata: { isGhostPreview: true },
    })

    expect(getMaxWallThickness('lvl')).toBe(0.15)
  })
})

describe('getLevelHeightContext inherits ghost filter', () => {
  it('skips ghost ceilings and ghost-removed walls', () => {
    makeLevel('lvl', ['wall_real', 'wall_ghost', 'ceil_real', 'ceil_ghost'])
    makeWall('wall_real', 'lvl', { height: 2.7 })
    makeWall('wall_ghost', 'lvl', {
      height: 99,
      metadata: { isGhostPreview: true },
    })
    makeCeiling('ceil_real', 'lvl', { height: 2.7 })
    makeCeiling('ceil_ghost', 'lvl', { height: 99, metadata: { isGhostRemoval: true } })

    const ctx = getLevelHeightContext('lvl')

    expect(ctx.wallHeight).toBe(2.7)
    expect(ctx.ceilings.map((c) => c.id)).toEqual(['ceil_real'])
  })
})

describe('getZonesForLevel ghost filter', () => {
  it('excludes ghost-preview zones', () => {
    makeLevel('lvl', ['zone_real', 'zone_ghost'])
    makeZone('zone_real', 'lvl')
    makeZone('zone_ghost', 'lvl', { metadata: { isGhostPreview: true } })

    const zones = getZonesForLevel('lvl')

    expect(zones.map((z) => z.id)).toEqual(['zone_real'])
  })
})
