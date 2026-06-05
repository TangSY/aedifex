import { describe, expect, test } from 'bun:test'
import { fenceDefinition } from '../definition'

// Fence handles are a flat constant tuple [front-move, back-move, height,
// start-picker, end-picker] — no shape-variant branching.
describe('fenceDefinition — registry contract', () => {
  test('declares fence kind, schemaVersion 1, structure category', () => {
    expect(fenceDefinition.kind).toBe('fence')
    expect(fenceDefinition.schemaVersion).toBe(1)
    expect(fenceDefinition.category).toBe('structure')
    expect(fenceDefinition.surfaceRole).toBe('wall')
  })

  test('parametrics + geometry + floorplan all declared (three-checkbox shape)', () => {
    // The doc says fence is a Stage B kind: pure `def.geometry` + no system.
    expect(fenceDefinition.parametrics).toBeDefined()
    expect(fenceDefinition.geometry).toBeDefined()
    expect(fenceDefinition.floorplan).toBeDefined()
  })
})

describe('fenceDefinition.capabilities', () => {
  test('selectable + duplicable + deletable + drawTool', () => {
    expect(fenceDefinition.capabilities.selectable?.hitVolume).toBe('bbox')
    expect(fenceDefinition.capabilities.duplicable).toBe(true)
    expect(fenceDefinition.capabilities.deletable).toBe(true)
    // Two-click draw flow (`tool.tsx` / `createFenceOnCurrentLevel`).
    expect(fenceDefinition.capabilities.drawTool).toBe(true)
  })

  test('surfaces.sides faces all (front + back paintable)', () => {
    expect(fenceDefinition.capabilities.surfaces?.sides?.faces).toBe('all')
  })

  test('movable is OMITTED — bespoke endpoint-drag MoveFenceTool keeps owning move', () => {
    // Source comment: "No `movable`: fence move is bespoke endpoint-drag.
    // Capability-driven dispatch keeps the legacy MoveFenceTool until the
    // affordance port (Stage D)."
    expect(fenceDefinition.capabilities.movable).toBeUndefined()
  })
})

describe('fenceDefinition.relations — corner-cascade contract', () => {
  test('linkedBy=endpoint-match (drives corner cascade)', () => {
    // Same idiom as wall: shared endpoints between fence nodes are
    // detected via endpoint-match and propagate in the move-endpoint flow.
    expect(fenceDefinition.relations?.linkedBy).toBe('endpoint-match')
  })

  test('cascadeDelete is none (deleting a fence does NOT cascade to linked neighbours)', () => {
    // Important contract: fence intentionally differs from wall here. Wall
    // uses `cascadeDelete: 'descendants'` because it owns hosted doors /
    // windows. A fence has no descendants, and its endpoint-linked siblings
    // are independent geometry — deleting one shouldn't drag its corner
    // partners with it.
    expect(fenceDefinition.relations?.cascadeDelete).toBe('none')
  })
})

describe('fenceDefinition.handles — 5-handle constant tuple', () => {
  test('5 handles: front-move, back-move, height, start-picker, end-picker', () => {
    const handles = Array.isArray(fenceDefinition.handles)
      ? fenceDefinition.handles
      : (fenceDefinition.handles as any)({})
    expect(handles).toHaveLength(5)
    // [0] + [1] are tap-action move shims (front + back faces).
    expect(handles[0].kind).toBe('tap-action')
    expect(handles[1].kind).toBe('tap-action')
    // [2] is the linear-resize height arrow.
    expect(handles[2].kind).toBe('linear-resize')
    expect(handles[2].axis).toBe('y')
    expect(handles[2].anchor).toBe('min')
    // [3] + [4] are corner-pickers for start / end.
    expect(handles[3].shape).toBe('corner-picker')
    expect(handles[4].shape).toBe('corner-picker')
  })
})

describe('fenceDefinition.affordanceTools / floorplanAffordances', () => {
  test('affordanceTools exposes curve + move-endpoint + move', () => {
    // Stage D — all four fence drag-affordances live in this folder.
    expect(fenceDefinition.affordanceTools?.curve).toBeDefined()
    expect(fenceDefinition.affordanceTools?.['move-endpoint']).toBeDefined()
    expect(fenceDefinition.affordanceTools?.move).toBeDefined()
  })

  test('floorplanAffordances exposes move-endpoint + curve (no resize-width — fence has no width arrow on the floor plan)', () => {
    expect(fenceDefinition.floorplanAffordances?.['move-endpoint']).toBeDefined()
    expect(fenceDefinition.floorplanAffordances?.curve).toBeDefined()
  })

  test('floorplanMoveTarget is set so the registry overlay takes Path 1 (no SVG transform stomp)', () => {
    expect(fenceDefinition.floorplanMoveTarget).toBeDefined()
  })
})

describe('fenceDefinition.presentation', () => {
  test('fence palette metadata is stable', () => {
    expect(fenceDefinition.presentation?.label).toBe('Fence')
    expect(fenceDefinition.presentation?.paletteSection).toBe('structure')
    expect(fenceDefinition.presentation?.paletteOrder).toBe(20)
  })
})
