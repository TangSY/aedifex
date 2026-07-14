import { describe, expect, test } from 'bun:test'
import { wallDefinition } from '../definition'

describe('wallDefinition — registry contract', () => {
  test('declares the wall kind with schemaVersion 5', () => {
    expect(wallDefinition.kind).toBe('wall')
    expect(wallDefinition.schemaVersion).toBe(5)
  })

  test('category is structure with wall surfaceRole', () => {
    expect(wallDefinition.category).toBe('structure')
    expect(wallDefinition.surfaceRole).toBe('wall')
  })
})

describe('wallDefinition.capabilities — surface contract', () => {
  test('selectable is declared with bbox hit volume', () => {
    expect(wallDefinition.capabilities.selectable).toBeDefined()
    expect(wallDefinition.capabilities.selectable?.hitVolume).toBe('bbox')
  })

  test('deletable === true', () => {
    // `Capabilities.deletable` is required for every kind so kinds make an
    // explicit choice; wall is removable.
    expect(wallDefinition.capabilities.deletable).toBe(true)
  })

  test('duplicable === true', () => {
    expect(wallDefinition.capabilities.duplicable).toBe(true)
  })

  test('surfaces.sides faces all (front and back can host items)', () => {
    expect(wallDefinition.capabilities.surfaces?.sides?.faces).toBe('all')
  })

  test('paint capability is declared (selection-manager paint routing)', () => {
    // Wall declares paint to route the editor's interior/exterior paint
    // dispatch through a generic capability instead of a kind switch.
    expect(wallDefinition.capabilities.paint).toBeDefined()
  })

  test('movable is OMITTED so the legacy MoveWallTool keeps owning move', () => {
    // The comment in source: "Wall move is bespoke (endpoint drag, linked-
    // wall corner cascade, ALT-detach). Omitting `movable` keeps the
    // legacy MoveWallTool via capability-driven dispatch."
    expect(wallDefinition.capabilities.movable).toBeUndefined()
  })
})

describe('wallDefinition.affordanceTools — 3D drag affordances', () => {
  test('exposes curve, move-endpoint, and move', () => {
    // All three are referenced from selection-manager's dispatch path; if a
    // refactor drops one, `isRegistryMovable('wall')` would also flip.
    expect(wallDefinition.affordanceTools).toBeDefined()
    expect(wallDefinition.affordanceTools?.curve).toBeDefined()
    expect(wallDefinition.affordanceTools?.['move-endpoint']).toBeDefined()
    expect(wallDefinition.affordanceTools?.move).toBeDefined()
  })
})

describe('wallDefinition.relations', () => {
  test('hosts the expected child kinds (door / window / item)', () => {
    expect(wallDefinition.relations?.hosts).toContain('door')
    expect(wallDefinition.relations?.hosts).toContain('window')
    expect(wallDefinition.relations?.hosts).toContain('item')
  })

  test('linkedBy endpoint-match — drives miter linking', () => {
    expect(wallDefinition.relations?.linkedBy).toBe('endpoint-match')
  })

  test('cascadeDelete is descendants — deleting a wall removes hosted children', () => {
    expect(wallDefinition.relations?.cascadeDelete).toBe('descendants')
  })

  test('affectsSpatial includes slab/ceiling/zone for spatial side-effects', () => {
    expect(wallDefinition.relations?.affectsSpatial).toContain('slab')
    expect(wallDefinition.relations?.affectsSpatial).toContain('ceiling')
    expect(wallDefinition.relations?.affectsSpatial).toContain('zone')
  })
})

describe('wallDefinition.defaults', () => {
  test('returns a default shape with start/end and unknown side identifiers', () => {
    const d = wallDefinition.defaults() as any
    expect(d.start).toEqual([0, 0])
    expect(d.end).toEqual([3, 0])
    expect(d.frontSide).toBe('unknown')
    expect(d.backSide).toBe('unknown')
  })
})

describe('wallDefinition.presentation', () => {
  test('label and palette placement is stable', () => {
    expect(wallDefinition.presentation?.label).toBe('Wall')
    expect(wallDefinition.presentation?.paletteSection).toBe('structure')
    expect(wallDefinition.presentation?.paletteOrder).toBe(10)
  })
})
