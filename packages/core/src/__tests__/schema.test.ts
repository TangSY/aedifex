import { describe, expect, it } from 'vitest'
import { BuildingNode } from '../schema/nodes/building'
import { CeilingNode } from '../schema/nodes/ceiling'
import { DoorNode, DoorSegment } from '../schema/nodes/door'
import { ItemNode, getScaledDimensions } from '../schema/nodes/item'
import { LevelNode } from '../schema/nodes/level'
import { RoofNode } from '../schema/nodes/roof'
import { RoofSegmentNode, RoofType } from '../schema/nodes/roof-segment'
import { ScanNode } from '../schema/nodes/scan'
import { SiteNode } from '../schema/nodes/site'
import { SlabNode } from '../schema/nodes/slab'
import { WallNode } from '../schema/nodes/wall'
import { WindowNode } from '../schema/nodes/window'
import { ZoneNode } from '../schema/nodes/zone'

// ============================================================================
// WallNode
// ============================================================================

describe('WallNode schema', () => {
  const minimalWall = {
    id: 'wall_abc123',
    start: [0, 0] as [number, number],
    end: [5, 0] as [number, number],
  }

  it('parses a valid wall with required fields', () => {
    const result = WallNode.safeParse(minimalWall)
    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.type).toBe('wall')
    expect(result.data.start).toEqual([0, 0])
    expect(result.data.end).toEqual([5, 0])
  })

  it('type discriminator is "wall"', () => {
    const result = WallNode.parse(minimalWall)
    expect(result.type).toBe('wall')
  })

  it('applies default values', () => {
    const result = WallNode.parse(minimalWall)
    expect(result.children).toEqual([])
    expect(result.frontSide).toBe('unknown')
    expect(result.backSide).toBe('unknown')
    expect(result.parentId).toBeNull()
    expect(result.visible).toBe(true)
    expect(result.metadata).toEqual({})
  })

  it('accepts optional thickness and height', () => {
    const result = WallNode.parse({ ...minimalWall, thickness: 0.3, height: 3.0 })
    expect(result.thickness).toBe(0.3)
    expect(result.height).toBe(3.0)
  })

  it('rejects missing start field', () => {
    const { start: _start, ...noStart } = minimalWall as any
    const result = WallNode.safeParse(noStart)
    expect(result.success).toBe(false)
  })

  it('rejects missing end field', () => {
    const { end: _end, ...noEnd } = minimalWall as any
    const result = WallNode.safeParse(noEnd)
    expect(result.success).toBe(false)
  })

  it('rejects non-tuple start (wrong length)', () => {
    const result = WallNode.safeParse({ ...minimalWall, start: [0, 0, 0] })
    expect(result.success).toBe(false)
  })

  it('accepts frontSide/backSide enum values', () => {
    const result = WallNode.parse({ ...minimalWall, frontSide: 'interior', backSide: 'exterior' })
    expect(result.frontSide).toBe('interior')
    expect(result.backSide).toBe('exterior')
  })

  it('rejects invalid frontSide value', () => {
    const result = WallNode.safeParse({ ...minimalWall, frontSide: 'invalid' })
    expect(result.success).toBe(false)
  })

  it('auto-generates id with wall_ prefix when not provided via objectId default', () => {
    // objectId('wall') generates a default — parse without id to trigger default
    const result = WallNode.parse({ start: [0, 0], end: [1, 0] })
    expect(result.id).toMatch(/^wall_/)
  })
})

// ============================================================================
// DoorNode
// ============================================================================

describe('DoorNode schema', () => {
  const minimalDoor = {
    id: 'door_abc123',
    parentId: 'wall_abc123',
  }

  it('parses minimal door with all defaults', () => {
    const result = DoorNode.parse(minimalDoor)
    expect(result.type).toBe('door')
    expect(result.width).toBe(0.9)
    expect(result.height).toBe(2.1)
    expect(result.hingesSide).toBe('left')
    expect(result.swingDirection).toBe('inward')
    expect(result.handle).toBe(true)
    expect(result.threshold).toBe(true)
    expect(result.doorCloser).toBe(false)
    expect(result.panicBar).toBe(false)
  })

  it('type discriminator is "door"', () => {
    const result = DoorNode.parse(minimalDoor)
    expect(result.type).toBe('door')
  })

  it('applies default position and rotation', () => {
    const result = DoorNode.parse(minimalDoor)
    expect(result.position).toEqual([0, 0, 0])
    expect(result.rotation).toEqual([0, 0, 0])
  })

  it('applies default segments (2 panel segments)', () => {
    const result = DoorNode.parse(minimalDoor)
    expect(result.segments).toHaveLength(2)
    expect(result.segments[0]!.type).toBe('panel')
    expect(result.segments[1]!.type).toBe('panel')
  })

  it('accepts custom width and height', () => {
    const result = DoorNode.parse({ ...minimalDoor, width: 1.2, height: 2.5 })
    expect(result.width).toBe(1.2)
    expect(result.height).toBe(2.5)
  })

  it('rejects invalid hingesSide', () => {
    const result = DoorNode.safeParse({ ...minimalDoor, hingesSide: 'center' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid swingDirection', () => {
    const result = DoorNode.safeParse({ ...minimalDoor, swingDirection: 'sideways' })
    expect(result.success).toBe(false)
  })

  it('auto-generates id with door_ prefix', () => {
    const result = DoorNode.parse({})
    expect(result.id).toMatch(/^door_/)
  })
})

describe('DoorSegment schema', () => {
  it('parses a valid panel segment', () => {
    const result = DoorSegment.parse({ type: 'panel', heightRatio: 0.6 })
    expect(result.type).toBe('panel')
    expect(result.heightRatio).toBe(0.6)
    expect(result.columnRatios).toEqual([1])
    expect(result.panelDepth).toBe(0.01)
    expect(result.panelInset).toBe(0.04)
  })

  it('parses glass and empty segment types', () => {
    expect(DoorSegment.parse({ type: 'glass', heightRatio: 0.4 }).type).toBe('glass')
    expect(DoorSegment.parse({ type: 'empty', heightRatio: 0.2 }).type).toBe('empty')
  })

  it('rejects invalid type', () => {
    const result = DoorSegment.safeParse({ type: 'solid', heightRatio: 1 })
    expect(result.success).toBe(false)
  })

  it('rejects missing heightRatio', () => {
    const result = DoorSegment.safeParse({ type: 'panel' })
    expect(result.success).toBe(false)
  })
})

// ============================================================================
// WindowNode
// ============================================================================

describe('WindowNode schema', () => {
  const minimalWindow = { id: 'window_abc123' }

  it('parses minimal window with all defaults', () => {
    const result = WindowNode.parse(minimalWindow)
    expect(result.type).toBe('window')
    expect(result.width).toBe(1.5)
    expect(result.height).toBe(1.5)
    expect(result.frameThickness).toBe(0.05)
    expect(result.frameDepth).toBe(0.07)
    expect(result.sill).toBe(true)
    expect(result.columnRatios).toEqual([1])
    expect(result.rowRatios).toEqual([1])
  })

  it('type discriminator is "window"', () => {
    expect(WindowNode.parse(minimalWindow).type).toBe('window')
  })

  it('applies default position', () => {
    const result = WindowNode.parse(minimalWindow)
    expect(result.position).toEqual([0, 0, 0])
  })

  it('accepts custom column and row ratios', () => {
    const result = WindowNode.parse({ ...minimalWindow, columnRatios: [0.5, 0.5], rowRatios: [0.6, 0.4] })
    expect(result.columnRatios).toEqual([0.5, 0.5])
    expect(result.rowRatios).toEqual([0.6, 0.4])
  })

  it('accepts optional side field', () => {
    const result = WindowNode.parse({ ...minimalWindow, side: 'back' })
    expect(result.side).toBe('back')
  })

  it('rejects invalid side value', () => {
    const result = WindowNode.safeParse({ ...minimalWindow, side: 'left' })
    expect(result.success).toBe(false)
  })

  it('auto-generates id with window_ prefix', () => {
    const result = WindowNode.parse({})
    expect(result.id).toMatch(/^window_/)
  })
})

// ============================================================================
// ItemNode
// ============================================================================

describe('ItemNode schema', () => {
  const minimalAsset = {
    id: 'sofa-modern',
    category: 'furniture',
    name: 'Modern Sofa',
    thumbnail: '/thumb.jpg',
    src: '/model.glb',
  }

  const minimalItem = {
    id: 'item_abc123',
    asset: minimalAsset,
  }

  it('parses valid item with required asset fields', () => {
    const result = ItemNode.parse(minimalItem)
    expect(result.type).toBe('item')
    expect(result.asset.id).toBe('sofa-modern')
  })

  it('type discriminator is "item"', () => {
    expect(ItemNode.parse(minimalItem).type).toBe('item')
  })

  it('applies default position, rotation, scale', () => {
    const result = ItemNode.parse(minimalItem)
    expect(result.position).toEqual([0, 0, 0])
    expect(result.rotation).toEqual([0, 0, 0])
    expect(result.scale).toEqual([1, 1, 1])
  })

  it('applies default asset dimensions and transforms', () => {
    const result = ItemNode.parse(minimalItem)
    expect(result.asset.dimensions).toEqual([1, 1, 1])
    expect(result.asset.offset).toEqual([0, 0, 0])
    expect(result.asset.scale).toEqual([1, 1, 1])
    expect(result.asset.rotation).toEqual([0, 0, 0])
  })

  it('rejects item missing asset', () => {
    const result = ItemNode.safeParse({ id: 'item_abc123' })
    expect(result.success).toBe(false)
  })

  it('rejects asset missing required name field', () => {
    const { name: _name, ...noName } = minimalAsset as any
    const result = ItemNode.safeParse({ id: 'item_abc123', asset: noName })
    expect(result.success).toBe(false)
  })

  it('accepts wall attachment properties', () => {
    const result = ItemNode.parse({ ...minimalItem, wallId: 'wall_xyz', wallT: 0.5 })
    expect(result.wallId).toBe('wall_xyz')
    expect(result.wallT).toBe(0.5)
  })

  it('auto-generates id with item_ prefix', () => {
    const result = ItemNode.parse({ asset: minimalAsset })
    expect(result.id).toMatch(/^item_/)
  })
})

describe('getScaledDimensions', () => {
  const baseItem = ItemNode.parse({
    asset: {
      id: 'test', category: 'furniture', name: 'Test', thumbnail: '', src: '',
      dimensions: [2, 1, 0.5],
    },
    scale: [2, 1, 3],
  })

  it('returns dimensions multiplied by scale', () => {
    const [w, h, d] = getScaledDimensions(baseItem)
    expect(w).toBeCloseTo(4)
    expect(h).toBeCloseTo(1)
    expect(d).toBeCloseTo(1.5)
  })

  it('returns original dimensions when scale is [1,1,1]', () => {
    const item = ItemNode.parse({
      asset: {
        id: 'test', category: 'furniture', name: 'Test', thumbnail: '', src: '',
        dimensions: [3, 2, 1],
      },
    })
    expect(getScaledDimensions(item)).toEqual([3, 2, 1])
  })
})

// ============================================================================
// SlabNode
// ============================================================================

describe('SlabNode schema', () => {
  const minimalSlab = {
    id: 'slab_abc123',
    polygon: [[0, 0], [5, 0], [5, 5], [0, 5]] as [number, number][],
  }

  it('parses valid slab', () => {
    const result = SlabNode.parse(minimalSlab)
    expect(result.type).toBe('slab')
    expect(result.polygon).toHaveLength(4)
  })

  it('type discriminator is "slab"', () => {
    expect(SlabNode.parse(minimalSlab).type).toBe('slab')
  })

  it('applies default elevation and holes', () => {
    const result = SlabNode.parse(minimalSlab)
    expect(result.elevation).toBe(0.05)
    expect(result.holes).toEqual([])
  })

  it('accepts custom elevation', () => {
    const result = SlabNode.parse({ ...minimalSlab, elevation: 0.1 })
    expect(result.elevation).toBe(0.1)
  })

  it('accepts holes array', () => {
    const result = SlabNode.parse({
      ...minimalSlab,
      holes: [[[1, 1], [2, 1], [2, 2], [1, 2]]],
    })
    expect(result.holes).toHaveLength(1)
  })

  it('rejects missing polygon', () => {
    const result = SlabNode.safeParse({ id: 'slab_abc123' })
    expect(result.success).toBe(false)
  })
})

// ============================================================================
// LevelNode
// ============================================================================

describe('LevelNode schema', () => {
  const minimalLevel = { id: 'level_abc123' }

  it('parses valid level', () => {
    const result = LevelNode.parse(minimalLevel)
    expect(result.type).toBe('level')
  })

  it('type discriminator is "level"', () => {
    expect(LevelNode.parse(minimalLevel).type).toBe('level')
  })

  it('applies default level number and children', () => {
    const result = LevelNode.parse(minimalLevel)
    expect(result.level).toBe(0)
    expect(result.children).toEqual([])
  })

  it('accepts custom level number', () => {
    const result = LevelNode.parse({ ...minimalLevel, level: 2 })
    expect(result.level).toBe(2)
  })

  it('auto-generates id with level_ prefix', () => {
    const result = LevelNode.parse({})
    expect(result.id).toMatch(/^level_/)
  })
})

// ============================================================================
// BuildingNode
// ============================================================================

describe('BuildingNode schema', () => {
  const minimalBuilding = { id: 'building_abc123' }

  it('parses valid building', () => {
    const result = BuildingNode.parse(minimalBuilding)
    expect(result.type).toBe('building')
  })

  it('type discriminator is "building"', () => {
    expect(BuildingNode.parse(minimalBuilding).type).toBe('building')
  })

  it('applies default position, rotation, children', () => {
    const result = BuildingNode.parse(minimalBuilding)
    expect(result.position).toEqual([0, 0, 0])
    expect(result.rotation).toEqual([0, 0, 0])
    expect(result.children).toEqual([])
  })

  it('accepts level children', () => {
    const result = BuildingNode.parse({ ...minimalBuilding, children: ['level_xyz'] })
    expect(result.children).toContain('level_xyz')
  })

  it('auto-generates id with building_ prefix', () => {
    const result = BuildingNode.parse({})
    expect(result.id).toMatch(/^building_/)
  })
})

// ============================================================================
// SiteNode
// ============================================================================

describe('SiteNode schema', () => {
  it('parses minimal site with defaults', () => {
    const result = SiteNode.parse({ id: 'site_abc123', children: [] })
    expect(result.type).toBe('site')
    expect(result.polygon?.type).toBe('polygon')
    expect(result.polygon?.points).toHaveLength(4)
  })

  it('type discriminator is "site"', () => {
    const result = SiteNode.parse({ id: 'site_abc123', children: [] })
    expect(result.type).toBe('site')
  })

  it('default polygon is a 30x30 square', () => {
    const result = SiteNode.parse({ id: 'site_abc123', children: [] })
    const points = result.polygon!.points
    expect(points).toContainEqual([-15, -15])
    expect(points).toContainEqual([15, 15])
  })

  it('auto-generates id with site_ prefix', () => {
    const result = SiteNode.parse({ children: [] })
    expect(result.id).toMatch(/^site_/)
  })
})

// ============================================================================
// ZoneNode
// ============================================================================

describe('ZoneNode schema', () => {
  const minimalZone = {
    id: 'zone_abc123',
    name: 'Living Room',
    polygon: [[0, 0], [5, 0], [5, 5], [0, 5]] as [number, number][],
  }

  it('parses valid zone', () => {
    const result = ZoneNode.parse(minimalZone)
    expect(result.type).toBe('zone')
    expect(result.name).toBe('Living Room')
  })

  it('type discriminator is "zone"', () => {
    expect(ZoneNode.parse(minimalZone).type).toBe('zone')
  })

  it('applies default color', () => {
    const result = ZoneNode.parse(minimalZone)
    expect(result.color).toBe('#3b82f6')
  })

  it('rejects missing name', () => {
    const { name: _name, ...noName } = minimalZone as any
    const result = ZoneNode.safeParse(noName)
    expect(result.success).toBe(false)
  })

  it('rejects missing polygon', () => {
    const { polygon: _polygon, ...noPoly } = minimalZone as any
    const result = ZoneNode.safeParse(noPoly)
    expect(result.success).toBe(false)
  })

  it('accepts custom color', () => {
    const result = ZoneNode.parse({ ...minimalZone, color: '#ff0000' })
    expect(result.color).toBe('#ff0000')
  })

  it('auto-generates id with zone_ prefix', () => {
    const result = ZoneNode.parse({ name: 'Test', polygon: [[0, 0], [1, 0], [1, 1]] })
    expect(result.id).toMatch(/^zone_/)
  })
})

// ============================================================================
// CeilingNode
// ============================================================================

describe('CeilingNode schema', () => {
  const minimalCeiling = {
    id: 'ceiling_abc123',
    polygon: [[0, 0], [5, 0], [5, 5], [0, 5]] as [number, number][],
  }

  it('parses valid ceiling', () => {
    const result = CeilingNode.parse(minimalCeiling)
    expect(result.type).toBe('ceiling')
  })

  it('type discriminator is "ceiling"', () => {
    expect(CeilingNode.parse(minimalCeiling).type).toBe('ceiling')
  })

  it('applies default height and holes', () => {
    const result = CeilingNode.parse(minimalCeiling)
    expect(result.height).toBe(2.5)
    expect(result.holes).toEqual([])
    expect(result.children).toEqual([])
  })

  it('rejects missing polygon', () => {
    const result = CeilingNode.safeParse({ id: 'ceiling_abc123' })
    expect(result.success).toBe(false)
  })
})

// ============================================================================
// RoofNode
// ============================================================================

describe('RoofNode schema', () => {
  const minimalRoof = { id: 'roof_abc123' }

  it('parses valid roof with defaults', () => {
    const result = RoofNode.parse(minimalRoof)
    expect(result.type).toBe('roof')
    expect(result.position).toEqual([0, 0, 0])
    expect(result.rotation).toBe(0)
    expect(result.children).toEqual([])
  })

  it('type discriminator is "roof"', () => {
    expect(RoofNode.parse(minimalRoof).type).toBe('roof')
  })

  it('accepts children IDs', () => {
    const result = RoofNode.parse({ ...minimalRoof, children: ['rseg_xyz'] })
    expect(result.children).toContain('rseg_xyz')
  })

  it('auto-generates id with roof_ prefix', () => {
    const result = RoofNode.parse({})
    expect(result.id).toMatch(/^roof_/)
  })
})

// ============================================================================
// RoofSegmentNode
// ============================================================================

describe('RoofSegmentNode schema', () => {
  const minimalSeg = { id: 'rseg_abc123' }

  it('parses with all defaults', () => {
    const result = RoofSegmentNode.parse(minimalSeg)
    expect(result.type).toBe('roof-segment')
    expect(result.roofType).toBe('gable')
    expect(result.width).toBe(8)
    expect(result.depth).toBe(6)
    expect(result.wallHeight).toBe(0.5)
    expect(result.roofHeight).toBe(2.5)
    expect(result.overhang).toBe(0.3)
  })

  it('type discriminator is "roof-segment"', () => {
    expect(RoofSegmentNode.parse(minimalSeg).type).toBe('roof-segment')
  })

  it('accepts all RoofType enum values', () => {
    const types = ['hip', 'gable', 'shed', 'gambrel', 'dutch', 'mansard', 'flat'] as const
    for (const rt of types) {
      const result = RoofSegmentNode.safeParse({ ...minimalSeg, roofType: rt })
      expect(result.success).toBe(true)
    }
  })

  it('rejects invalid roofType', () => {
    const result = RoofSegmentNode.safeParse({ ...minimalSeg, roofType: 'pyramid' })
    expect(result.success).toBe(false)
  })

  it('auto-generates id with rseg_ prefix', () => {
    const result = RoofSegmentNode.parse({})
    expect(result.id).toMatch(/^rseg_/)
  })
})

describe('RoofType enum', () => {
  it('contains all expected roof types', () => {
    const result = RoofType.safeParse('gable')
    expect(result.success).toBe(true)
  })

  it('rejects unknown types', () => {
    const result = RoofType.safeParse('pyramid')
    expect(result.success).toBe(false)
  })
})

// ============================================================================
// ScanNode
// ============================================================================

describe('ScanNode schema', () => {
  const minimalScan = {
    id: 'scan_abc123',
    url: 'https://example.com/scan.e57',
  }

  it('parses valid scan', () => {
    const result = ScanNode.parse(minimalScan)
    expect(result.type).toBe('scan')
    expect(result.url).toBe('https://example.com/scan.e57')
  })

  it('type discriminator is "scan"', () => {
    expect(ScanNode.parse(minimalScan).type).toBe('scan')
  })

  it('applies default position, rotation, scale, opacity', () => {
    const result = ScanNode.parse(minimalScan)
    expect(result.position).toEqual([0, 0, 0])
    expect(result.rotation).toEqual([0, 0, 0])
    expect(result.scale).toBe(1)
    expect(result.opacity).toBe(100)
  })

  it('rejects missing url', () => {
    const result = ScanNode.safeParse({ id: 'scan_abc123' })
    expect(result.success).toBe(false)
  })

  it('rejects opacity out of range', () => {
    const result = ScanNode.safeParse({ ...minimalScan, opacity: 150 })
    expect(result.success).toBe(false)
  })

  it('rejects negative opacity', () => {
    const result = ScanNode.safeParse({ ...minimalScan, opacity: -1 })
    expect(result.success).toBe(false)
  })

  it('accepts opacity at boundary values', () => {
    expect(ScanNode.safeParse({ ...minimalScan, opacity: 0 }).success).toBe(true)
    expect(ScanNode.safeParse({ ...minimalScan, opacity: 100 }).success).toBe(true)
  })

  it('auto-generates id with scan_ prefix', () => {
    const result = ScanNode.parse({ url: 'https://example.com/scan.e57' })
    expect(result.id).toMatch(/^scan_/)
  })
})
