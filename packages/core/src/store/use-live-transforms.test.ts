import { beforeEach, describe, expect, mock, test } from 'bun:test'
import useLiveTransforms, { type LiveTransform } from './use-live-transforms'

/**
 * use-live-transforms — sibling of use-live-node-overrides, but a deliberate
 * divergence: `set()` REPLACES the LiveTransform value entirely (no merge).
 *
 * The reason for the divergence is pinned here. Overrides hold *partial*
 * patches that the renderer applies on top of the canonical node; transforms
 * are *complete snapshots* (position + rotation tuple) that move every frame
 * during a drag. Merging would let stale rotation leak into a position-only
 * publish.
 */

function resetStore() {
  useLiveTransforms.setState({ transforms: new Map() })
}

beforeEach(resetStore)

const T1: LiveTransform = { position: [1, 2, 3], rotation: 0 }
const T2: LiveTransform = { position: [4, 5, 6], rotation: Math.PI / 2 }

describe('set — REPLACES (no merge)', () => {
  test('a second set fully replaces the prior transform', () => {
    useLiveTransforms.getState().set('n1', T1)
    useLiveTransforms.getState().set('n1', T2)
    expect(useLiveTransforms.getState().get('n1')).toEqual(T2)
  })

  test('replacement keeps no leaked fields from the prior value', () => {
    // Regression guard against accidentally bringing back the merge semantics
    // from use-live-node-overrides. A position-only publish must NOT carry
    // forward the previous rotation.
    useLiveTransforms.getState().set('n1', { position: [10, 0, 10], rotation: 1.57 })
    // Hypothetical mid-drag publish at a new position with rotation reset.
    useLiveTransforms.getState().set('n1', { position: [11, 0, 10], rotation: 0 })
    expect(useLiveTransforms.getState().get('n1')?.rotation).toBe(0)
  })
})

describe('store identity invariant', () => {
  test('every set produces a NEW Map (zustand shallow-compare triggers a re-render)', () => {
    const before = useLiveTransforms.getState().transforms
    useLiveTransforms.getState().set('n1', T1)
    const after = useLiveTransforms.getState().transforms
    expect(after).not.toBe(before)
  })

  test('subscribers are notified exactly once per set', () => {
    const listener = mock(() => {})
    const unsub = useLiveTransforms.subscribe(listener)
    useLiveTransforms.getState().set('n1', T1)
    expect(listener).toHaveBeenCalledTimes(1)
    unsub()
  })
})

describe('get / clear / clearAll', () => {
  test('get returns undefined for unknown ids', () => {
    expect(useLiveTransforms.getState().get('ghost')).toBeUndefined()
  })

  test('clear drops only the target id', () => {
    useLiveTransforms.getState().set('a', T1)
    useLiveTransforms.getState().set('b', T2)
    useLiveTransforms.getState().clear('a')
    expect(useLiveTransforms.getState().get('a')).toBeUndefined()
    expect(useLiveTransforms.getState().get('b')).toEqual(T2)
  })

  test('clearAll wipes every entry', () => {
    useLiveTransforms.getState().set('a', T1)
    useLiveTransforms.getState().set('b', T2)
    useLiveTransforms.getState().clearAll()
    expect(useLiveTransforms.getState().transforms.size).toBe(0)
  })
})
