import { describe, expect, test } from 'bun:test'
import { elevatorDefinition } from '../definition'

describe('elevatorDefinition — registry contract', () => {
  test('declares the elevator kind with schemaVersion 1', () => {
    expect(elevatorDefinition.kind).toBe('elevator')
    expect(elevatorDefinition.schemaVersion).toBe(1)
    expect(elevatorDefinition.category).toBe('structure')
    expect(elevatorDefinition.surfaceRole).toBe('joinery')
  })
})

describe('elevatorDefinition.floorplanScope — drift guard', () => {
  test('floorplanScope === "building"', () => {
    // Critical contract — if this regresses to 'level' (the default), the
    // FloorplanRegistryLayer's level-rooted DFS never reaches elevators
    // (they're parented to the BUILDING, sibling of levels) and elevators
    // silently vanish from the floor plan. The dual-source-of-truth issue
    // documented at the top of `floorplanScope` in `core/registry/types.ts`.
    expect((elevatorDefinition as any).floorplanScope).toBe('building')
  })
})

describe('elevatorDefinition.capabilities', () => {
  test('movable IS declared — generic XZ translate with grid snap', () => {
    // Contrast with door / window / wall: elevator publishes a generic
    // movable cap so the floating action menu's Move button works through
    // the standard 2D body-move path.
    expect(elevatorDefinition.capabilities.movable).toBeDefined()
    expect(elevatorDefinition.capabilities.movable?.axes).toEqual(['x', 'z'])
    expect(elevatorDefinition.capabilities.movable?.gridSnap).toBe(true)
  })

  test('selectable + duplicable + deletable set', () => {
    expect(elevatorDefinition.capabilities.selectable).toBeDefined()
    expect(elevatorDefinition.capabilities.duplicable).toBe(true)
    expect(elevatorDefinition.capabilities.deletable).toBe(true)
  })
})

describe('elevatorDefinition.handles — five handles', () => {
  test('exposes 5 handles (width, depth, cab height, rotate, move)', () => {
    const handles = Array.isArray(elevatorDefinition.handles)
      ? elevatorDefinition.handles
      : (elevatorDefinition.handles as any)({})
    expect(handles).toHaveLength(5)
    // [3] is the rotate gizmo (arc-resize shape='rotate'); [4] is the
    // tap-to-engage move grip added by the unified handle system.
    expect((handles[3] as any).kind).toBe('arc-resize')
    expect((handles[3] as any).shape).toBe('rotate')
    expect((handles[4] as any).kind).toBe('tap-action')
    expect((handles[4] as any).shape).toBe('move-cross')
  })
})

describe('elevatorDefinition.floorplanAffordances', () => {
  test('exposes elevator-resize and elevator-rotate', () => {
    expect(elevatorDefinition.floorplanAffordances?.['elevator-resize']).toBeDefined()
    expect(elevatorDefinition.floorplanAffordances?.['elevator-rotate']).toBeDefined()
  })
})

describe('elevatorDefinition.presentation', () => {
  test('elevator palette metadata is stable', () => {
    expect(elevatorDefinition.presentation?.label).toBe('Elevator')
    expect(elevatorDefinition.presentation?.paletteSection).toBe('structure')
  })
})
