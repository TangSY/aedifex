import { describe, expect, test } from 'bun:test'
import { windowDefinition } from '../definition'

describe('windowDefinition — registry contract', () => {
  test('declares the window kind with schemaVersion 1', () => {
    expect(windowDefinition.kind).toBe('window')
    expect(windowDefinition.schemaVersion).toBe(1)
  })

  test('category is structure', () => {
    expect(windowDefinition.category).toBe('structure')
  })
})

describe('windowDefinition.capabilities — same host-ref contract as door', () => {
  test('hostRefFields includes "wallId"', () => {
    // Window mirrors the door's host-binding pattern: `wallId` is the only
    // declared host ref today. Tests guard that the pair stays in lockstep.
    expect(windowDefinition.capabilities.hostRefFields).toEqual(['wallId'])
  })

  test('selectable + duplicable + deletable + wallOpeningPlacement set', () => {
    expect(windowDefinition.capabilities.selectable).toBeDefined()
    expect(windowDefinition.capabilities.duplicable).toBe(true)
    expect(windowDefinition.capabilities.deletable).toBe(true)
    expect(windowDefinition.capabilities.wallOpeningPlacement).toBe(true)
  })

  test('movable is OMITTED — bespoke MoveWindowTool owns move', () => {
    expect(windowDefinition.capabilities.movable).toBeUndefined()
  })
})

describe('windowDefinition.handles — four arrows', () => {
  test('returns four handle descriptors (left width, right width, top height, bottom height)', () => {
    // Source: `windowHandles = [..., windowHeightHandle('top'), windowHeightHandle('bottom')]`.
    // Two height arrows distinguish window from door (door has one).
    const handles = Array.isArray(windowDefinition.handles)
      ? windowDefinition.handles
      : (windowDefinition.handles as any)({})
    expect(handles).toHaveLength(4)
  })
})

describe('windowDefinition.affordanceTools / floorplanAffordances', () => {
  test('affordanceTools.move exposed', () => {
    expect(windowDefinition.affordanceTools?.move).toBeDefined()
  })

  test('floorplanAffordances exposes "resize-width" (mirrors door)', () => {
    expect(windowDefinition.floorplanAffordances?.['resize-width']).toBeDefined()
  })
})

describe('windowDefinition.presentation', () => {
  test('window palette metadata is stable', () => {
    expect(windowDefinition.presentation?.label).toBe('Window')
    expect(windowDefinition.presentation?.paletteSection).toBe('structure')
    expect(windowDefinition.presentation?.paletteOrder).toBe(60)
  })
})
