import { describe, expect, test } from 'bun:test'
import { pointInPolygon2D, SlabNode } from '@aedifex/core'
import { slabDefinition } from '../definition'

function makeSlabLike(overrides: Record<string, unknown> = {}) {
  return {
    object: 'node',
    id: 'slab_test',
    type: 'slab',
    parentId: null,
    visible: true,
    metadata: {},
    polygon: [],
    holes: [],
    holeMetadata: [],
    elevation: 0.05,
    autoFromWalls: false,
    ...overrides,
  }
}

describe('slabDefinition — registry contract', () => {
  test('declares slab kind, schemaVersion 1, structure category, floor surfaceRole', () => {
    expect(slabDefinition.kind).toBe('slab')
    expect(slabDefinition.schemaVersion).toBe(1)
    expect(slabDefinition.category).toBe('structure')
    expect(slabDefinition.surfaceRole).toBe('floor')
  })
})

describe('slabDefinition.capabilities', () => {
  test('surfaces.top.height === slab.elevation (items host on the slab top)', () => {
    const topConfig = slabDefinition.capabilities.surfaces?.top
    expect(topConfig).toBeDefined()
    const elevation = (topConfig?.height as (n: any) => number)(
      makeSlabLike({ elevation: 0.15 }),
    )
    expect(elevation).toBe(0.15)
  })

  test('selectable + duplicable + deletable set; no movable (legacy mover keeps owning)', () => {
    expect(slabDefinition.capabilities.selectable).toBeDefined()
    expect(slabDefinition.capabilities.duplicable).toBe(true)
    expect(slabDefinition.capabilities.deletable).toBe(true)
    expect(slabDefinition.capabilities.movable).toBeUndefined()
  })
})

describe('slabDefinition.relations', () => {
  test('hosts items, cascadeDelete descendants', () => {
    expect(slabDefinition.relations?.hosts).toEqual(['item'])
    expect(slabDefinition.relations?.cascadeDelete).toBe('descendants')
  })
})

describe('slabDefinition.handles — height arrow', () => {
  test('single height arrow at centroid, Y === elevation + offset', () => {
    // Slab arrow Y differs from ceiling — slab's mesh sits at world Y=0 so
    // the arrow's local Y stacks `elevation + HEIGHT_HANDLE_OFFSET` to clear
    // the slab top. Centroid logic is identical to ceiling.
    const handlesFn = slabDefinition.handles as (n: any) => any[]
    const slab = makeSlabLike({
      polygon: [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
      ],
      elevation: 0.5,
    })
    const handles = handlesFn(slab)
    expect(handles).toHaveLength(1)
    const handle = handles[0]
    expect(handle.kind).toBe('linear-resize')
    expect(handle.axis).toBe('y')
    const position = handle.placement.position(slab)
    // Centroid = (1, 1).
    expect(position[0]).toBe(1)
    expect(position[2]).toBe(1)
    // Y = elevation + HEIGHT_HANDLE_OFFSET (0.22 per source).
    expect(position[1]).toBeCloseTo(0.5 + 0.22, 6)
  })
})

describe('slabDefinition.geometry / floorplan — generic dispatch contract', () => {
  test('geometry function is declared (drives generic GeometrySystem rebuilds)', () => {
    expect(typeof slabDefinition.geometry).toBe('function')
  })

  test('floorplan builder is declared (registry-driven 2D rendering)', () => {
    expect(typeof slabDefinition.floorplan).toBe('function')
  })
})

describe('slabDefinition.floorplanAffordances', () => {
  test('boundary editing affordances exposed for polygon edit', () => {
    const aff = slabDefinition.floorplanAffordances
    expect(aff?.['move-vertex']).toBeDefined()
    expect(aff?.['add-vertex']).toBeDefined()
    expect(aff?.['move-edge']).toBeDefined()
  })
})

describe('slabDefinition.defaults — initial shape', () => {
  test('starts with empty polygon + 0.05m elevation (default slab thickness)', () => {
    const d = slabDefinition.defaults() as any
    expect(d.polygon).toEqual([])
    expect(d.holes).toEqual([])
    expect(d.elevation).toBe(0.05)
    expect(d.autoFromWalls).toBe(false)
  })
})

// --- Upstream (03f57b1f): height handle avoids hole cutouts ---

function getHeightHandlePosition(slab: SlabNode) {
  const handles =
    typeof slabDefinition.handles === 'function'
      ? slabDefinition.handles(slab)
      : (slabDefinition.handles ?? [])
  const heightHandle = handles.find(
    (handle) => handle.kind === 'linear-resize' && handle.axis === 'y',
  )
  if (!(heightHandle && heightHandle.kind === 'linear-resize')) {
    throw new Error('Missing slab height handle')
  }
  return heightHandle.placement.position(slab, {} as never)
}

describe('slabDefinition handles', () => {
  test('keeps the height handle over solid slab area when the center is a hole', () => {
    const slab = SlabNode.parse({
      polygon: [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
      ],
      holes: [
        [
          [1, 1],
          [3, 1],
          [3, 3],
          [1, 3],
        ],
      ],
    })

    const [x, , z] = getHeightHandlePosition(slab)

    expect(pointInPolygon2D([x, z], slab.polygon, { includeBoundary: false })).toBe(true)
    expect(pointInPolygon2D([x, z], slab.holes[0]!, { includeBoundary: true })).toBe(false)
  })
})
