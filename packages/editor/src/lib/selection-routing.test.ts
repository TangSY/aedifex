import { describe, expect, it, test } from 'vitest'
import type { AnyNode } from '@aedifex/core'
import {
  resolveNodeSelectionTarget,
  resolveSelectedIdsForNodeClick,
  selectionModifiersFromEvent,
  shouldPreserveSelectedRoofHostTarget,
} from './selection-routing'

describe('resolveSelectedIdsForNodeClick', () => {
  it('preserves the pre-routing selection when a phase switch clears current ids', () => {
    expect(
      resolveSelectedIdsForNodeClick({
        baseSelectedIds: ['wall_1'],
        currentSelectedIds: [],
        modifierKeys: { meta: true, ctrl: false, shift: false },
        nodeId: 'item_1',
      }),
    ).toEqual(['wall_1', 'item_1'])
  })

  it('toggles from the pre-routing selection while a modifier is held', () => {
    expect(
      resolveSelectedIdsForNodeClick({
        baseSelectedIds: ['wall_1', 'item_1'],
        currentSelectedIds: [],
        modifierKeys: { meta: false, ctrl: false, shift: true },
        nodeId: 'item_1',
      }),
    ).toEqual(['wall_1'])
  })
})

describe('selectionModifiersFromEvent', () => {
  it('falls back to tracked modifier state when the click event omits keys', () => {
    expect(selectionModifiersFromEvent({}, { meta: false, ctrl: true, shift: false })).toEqual({
      meta: false,
      ctrl: true,
      shift: false,
    })
  })

  it('prefers explicit event key state over stale tracked modifiers', () => {
    expect(
      selectionModifiersFromEvent(
        { metaKey: false, ctrlKey: false, shiftKey: false },
        { meta: true, ctrl: true, shift: true },
      ),
    ).toEqual({
      meta: false,
      ctrl: false,
      shift: false,
    })
  })
})

describe('resolveNodeSelectionTarget', () => {
  it('routes furniture items to furnish', () => {
    const node = {
      id: 'item_1',
      type: 'item',
      asset: { category: 'furniture' },
    } as unknown as AnyNode

    expect(resolveNodeSelectionTarget(node)).toEqual({ phase: 'furnish' })
  })

  it('routes door and window catalog items to structure', () => {
    const node = {
      id: 'item_1',
      type: 'item',
      asset: { category: 'door' },
    } as unknown as AnyNode

    expect(resolveNodeSelectionTarget(node)).toEqual({
      phase: 'structure',
      structureLayer: 'elements',
    })
  })
})

describe('shouldPreserveSelectedRoofHostTarget', () => {
  test('keeps the roof host target while that roof is the sole armed selection', () => {
    const node = { id: 'roof_1', type: 'roof' } as unknown as AnyNode

    expect(
      shouldPreserveSelectedRoofHostTarget({
        node,
        selectedIds: ['roof_1'],
        armedRoofId: 'roof_1',
      }),
    ).toBe(true)
  })

  test('falls back to segment targeting when the roof host is not armed', () => {
    const node = { id: 'roof_1', type: 'roof' } as unknown as AnyNode

    expect(
      shouldPreserveSelectedRoofHostTarget({
        node,
        selectedIds: ['roof_1'],
        armedRoofId: null,
      }),
    ).toBe(false)
  })

  test('falls back to segment targeting when the roof is no longer the sole selection', () => {
    const node = { id: 'roof_1', type: 'roof' } as unknown as AnyNode

    expect(
      shouldPreserveSelectedRoofHostTarget({
        node,
        selectedIds: ['roof_1', 'wall_1'],
        armedRoofId: 'roof_1',
      }),
    ).toBe(false)
  })
})
