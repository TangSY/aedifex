import { describe, expect, test } from 'bun:test'
import { doorDefinition } from '../definition'

describe('doorDefinition — registry contract', () => {
  test('declares the door kind with schemaVersion 1', () => {
    expect(doorDefinition.kind).toBe('door')
    expect(doorDefinition.schemaVersion).toBe(1)
  })

  test('joinery surfaceRole — door is a structural opening', () => {
    expect(doorDefinition.category).toBe('structure')
    expect(doorDefinition.surfaceRole).toBe('joinery')
  })
})

describe('doorDefinition.capabilities — host-ref contract', () => {
  test('hostRefFields includes wallId + roof-surface refs', () => {
    // Door is hosted on a wall — `wallId` is re-derived at preset
    // placement time, so host apps strip it via `getHostRefFields(def)`.
    // Upstream PR #438 added roof-surface placement, so the contract now
    // covers `roofSegmentId` + `roofFace` too.
    expect(doorDefinition.capabilities.hostRefFields).toEqual(['wallId', 'roofSegmentId', 'roofFace'])
  })

  test('selectable + duplicable + deletable + wallOpeningPlacement set', () => {
    expect(doorDefinition.capabilities.selectable).toBeDefined()
    expect(doorDefinition.capabilities.duplicable).toBe(true)
    expect(doorDefinition.capabilities.deletable).toBe(true)
    // wallOpeningPlacement lets the floor-plan layer pass wall-background
    // clicks through during door placement / move-on-wall.
    expect(doorDefinition.capabilities.wallOpeningPlacement).toBe(true)
  })

  test('movable is OMITTED — bespoke wall-slide move tool keeps owning move', () => {
    expect(doorDefinition.capabilities.movable).toBeUndefined()
  })
})

describe('doorDefinition.affordanceTools — 3D move-on-wall', () => {
  test('exposes affordanceTools.move', () => {
    expect(doorDefinition.affordanceTools?.move).toBeDefined()
  })
})

describe('doorDefinition.floorplanAffordances — 2D resize-width drag', () => {
  test('exposes "resize-width" affordance for the floor-plan side arrows', () => {
    // The 2D side arrows on a selected door run through this affordance.
    expect(doorDefinition.floorplanAffordances?.['resize-width']).toBeDefined()
  })
})

describe('doorDefinition.handles — width + height + roof-surface', () => {
  test('returns four handle descriptors (left width, right width, height, roof-surface)', () => {
    // Source: `doorHandles = [doorWidthHandle('left'), doorWidthHandle('right'), doorHeightHandle()]`
    // plus a roof-surface handle added by upstream PR #438 for slope placement.
    const handles = Array.isArray(doorDefinition.handles)
      ? doorDefinition.handles
      : (doorDefinition.handles as any)({})
    expect(handles).toHaveLength(4)
  })
})

describe('doorDefinition.presentation', () => {
  test('door palette metadata is stable', () => {
    expect(doorDefinition.presentation?.label).toBe('Door')
    expect(doorDefinition.presentation?.paletteSection).toBe('structure')
    expect(doorDefinition.presentation?.paletteOrder).toBe(50)
  })
})
