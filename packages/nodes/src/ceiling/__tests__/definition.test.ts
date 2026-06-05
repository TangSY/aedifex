import { describe, expect, test } from 'bun:test'
import { ceilingDefinition } from '../definition'

// HEIGHT_HANDLE_OFFSET in source — duplicated here so the test pins the
// constant. If a refactor exports it, prefer importing.
const HEIGHT_HANDLE_OFFSET = 0.22

function makeCeilingLike(overrides: Record<string, unknown> = {}) {
  return {
    object: 'node',
    id: 'ceiling_test',
    type: 'ceiling',
    parentId: null,
    visible: true,
    metadata: {},
    polygon: [],
    holes: [],
    holeMetadata: [],
    height: 2.5,
    autoFromWalls: false,
    ...overrides,
  }
}

describe('ceilingDefinition — registry contract', () => {
  test('declares ceiling kind, schemaVersion 1, structure category, ceiling surfaceRole', () => {
    expect(ceilingDefinition.kind).toBe('ceiling')
    expect(ceilingDefinition.schemaVersion).toBe(1)
    expect(ceilingDefinition.category).toBe('structure')
    expect(ceilingDefinition.surfaceRole).toBe('ceiling')
  })
})

describe('ceilingDefinition.handles — height arrow Y placement (regression guard)', () => {
  test('handle Y === HEIGHT_HANDLE_OFFSET, NOT height + offset', () => {
    // Critical regression guard. Previous bug: the handle Y was computed as
    // `height + HEIGHT_HANDLE_OFFSET` which double-added the height (because
    // CeilingSystem already parks `mesh.position.y = height - 0.01`, so the
    // local Y is the *offset above that plane*, not `height + offset`).
    // The source comment now explicitly calls this out.
    const handlesFn = ceilingDefinition.handles as (n: any) => any[]
    const handles = handlesFn(makeCeilingLike({ polygon: [[0, 0]], height: 2.5 }))
    expect(handles).toHaveLength(1)
    const handle = handles[0]
    expect(handle.kind).toBe('linear-resize')
    expect(handle.axis).toBe('y')
    const position = handle.placement.position(makeCeilingLike({ polygon: [[0, 0]], height: 2.5 }))
    // Y should equal the bare offset, regardless of the height field.
    expect(position[1]).toBe(HEIGHT_HANDLE_OFFSET)
    expect(position[1]).not.toBe(2.5 + HEIGHT_HANDLE_OFFSET)
  })

  test('handle Y is independent of height — changing height does not shift the arrow', () => {
    const handlesFn = ceilingDefinition.handles as (n: any) => any[]
    const aPosition = handlesFn(makeCeilingLike({ polygon: [[0, 0]], height: 2 }))[0].placement.position(
      makeCeilingLike({ polygon: [[0, 0]], height: 2 }),
    )
    const bPosition = handlesFn(makeCeilingLike({ polygon: [[0, 0]], height: 5 }))[0].placement.position(
      makeCeilingLike({ polygon: [[0, 0]], height: 5 }),
    )
    expect(aPosition[1]).toBe(bPosition[1])
  })

  test('placement XZ is the polygon centroid', () => {
    // Centroid of (0,0)-(4,0)-(4,4)-(0,4) is (2,2).
    const handlesFn = ceilingDefinition.handles as (n: any) => any[]
    const ceiling = makeCeilingLike({
      polygon: [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
      ],
    })
    const position = handlesFn(ceiling)[0].placement.position(ceiling)
    expect(position[0]).toBe(2)
    expect(position[2]).toBe(2)
  })

  test('empty polygon → centroid (0,0)', () => {
    const handlesFn = ceilingDefinition.handles as (n: any) => any[]
    const ceiling = makeCeilingLike({ polygon: [] })
    const position = handlesFn(ceiling)[0].placement.position(ceiling)
    expect(position[0]).toBe(0)
    expect(position[2]).toBe(0)
  })
})

describe('ceilingDefinition.capabilities', () => {
  test('surfaces.top.height === ceiling.height (ceiling hosts items at its plane)', () => {
    const topConfig = ceilingDefinition.capabilities.surfaces?.top
    expect(topConfig).toBeDefined()
    const height = (topConfig?.height as (n: any) => number)(makeCeilingLike({ height: 3.2 }))
    expect(height).toBe(3.2)
  })

  test('selectable + duplicable + deletable set; no movable', () => {
    expect(ceilingDefinition.capabilities.selectable).toBeDefined()
    expect(ceilingDefinition.capabilities.duplicable).toBe(true)
    expect(ceilingDefinition.capabilities.deletable).toBe(true)
    expect(ceilingDefinition.capabilities.movable).toBeUndefined()
  })
})

describe('ceilingDefinition.relations', () => {
  test('hosts items; cascadeDelete is descendants', () => {
    expect(ceilingDefinition.relations?.hosts).toEqual(['item'])
    expect(ceilingDefinition.relations?.cascadeDelete).toBe('descendants')
  })
})
