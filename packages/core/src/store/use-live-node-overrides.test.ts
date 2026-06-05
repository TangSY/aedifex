import { beforeEach, describe, expect, mock, test } from 'bun:test'
import useLiveNodeOverrides, { getEffectiveNode } from './use-live-node-overrides'

/**
 * use-live-node-overrides — the transient publish/subscribe channel that
 * decouples the drag/edit interactions from the scene store. Two invariants
 * the renderer relies on:
 *   1. setMany(N) → exactly ONE store notification (so React re-renders once
 *      per drag-tick, not N+1 times).
 *   2. The Map identity is replaced on every write (zustand shallow-compares
 *      slice references; mutating the existing Map would not trigger a
 *      re-render and the floorplan would freeze).
 */

function resetStore() {
  useLiveNodeOverrides.setState({ overrides: new Map() })
}

beforeEach(resetStore)

describe('set / get / clear', () => {
  test('set merges into the existing override entry (does not erase prior keys)', () => {
    useLiveNodeOverrides.getState().set('n1', { foo: 1 })
    useLiveNodeOverrides.getState().set('n1', { bar: 2 })
    expect(useLiveNodeOverrides.getState().get('n1')).toEqual({ foo: 1, bar: 2 })
  })

  test('set replaces overlapping keys (later value wins)', () => {
    useLiveNodeOverrides.getState().set('n1', { foo: 1 })
    useLiveNodeOverrides.getState().set('n1', { foo: 9 })
    expect(useLiveNodeOverrides.getState().get('n1')).toEqual({ foo: 9 })
  })

  test('clear drops only the target node id', () => {
    useLiveNodeOverrides.getState().set('a', { foo: 1 })
    useLiveNodeOverrides.getState().set('b', { foo: 2 })
    useLiveNodeOverrides.getState().clear('a')
    expect(useLiveNodeOverrides.getState().get('a')).toBeUndefined()
    expect(useLiveNodeOverrides.getState().get('b')).toEqual({ foo: 2 })
  })

  test('clearAll wipes the entire Map', () => {
    useLiveNodeOverrides.getState().set('a', { foo: 1 })
    useLiveNodeOverrides.getState().set('b', { foo: 2 })
    useLiveNodeOverrides.getState().clearAll()
    expect(useLiveNodeOverrides.getState().overrides.size).toBe(0)
  })
})

describe('setMany — drag-perf invariants', () => {
  test('N entries → exactly ONE zustand notification + ONE Map clone', () => {
    const listener = mock(() => {})
    const unsub = useLiveNodeOverrides.subscribe(listener)
    const initialMap = useLiveNodeOverrides.getState().overrides
    useLiveNodeOverrides.getState().setMany([
      ['n1', { position: [0, 0, 0] }],
      ['n2', { position: [1, 0, 0] }],
      ['n3', { position: [2, 0, 0] }],
      ['n4', { position: [3, 0, 0] }],
    ])
    const nextMap = useLiveNodeOverrides.getState().overrides
    // ── one notification, regardless of entry count ──
    expect(listener).toHaveBeenCalledTimes(1)
    // ── one Map clone: the store reference changed, but the original Map
    // identity is preserved (proves we didn't mutate state.overrides in place)
    expect(nextMap).not.toBe(initialMap)
    expect(initialMap.size).toBe(0)
    // all entries are visible after the single write
    expect(nextMap.size).toBe(4)
    unsub()
  })

  test('setMany merges entry-by-entry (same node spread, not replace)', () => {
    useLiveNodeOverrides.getState().set('n1', { existing: 'keep' })
    useLiveNodeOverrides.getState().setMany([['n1', { added: 'new' }]])
    expect(useLiveNodeOverrides.getState().get('n1')).toEqual({
      existing: 'keep',
      added: 'new',
    })
  })

  test('empty array → no-op (no notification, no Map clone)', () => {
    const listener = mock(() => {})
    const unsub = useLiveNodeOverrides.subscribe(listener)
    const before = useLiveNodeOverrides.getState().overrides
    useLiveNodeOverrides.getState().setMany([])
    const after = useLiveNodeOverrides.getState().overrides
    expect(listener).not.toHaveBeenCalled()
    expect(after).toBe(before)
    unsub()
  })
})

describe('getEffectiveNode helper', () => {
  test('returns input unchanged when no override exists (caller can pass-through)', () => {
    const node = { id: 'n1', x: 1 }
    expect(getEffectiveNode(node)).toBe(node) // same reference
  })

  test('returns input unchanged when override is an empty object (treated as no-op)', () => {
    useLiveNodeOverrides.getState().set('n1', {})
    const node = { id: 'n1', x: 1 }
    expect(getEffectiveNode(node)).toBe(node)
  })

  test('returns a fresh merged copy when override exists (override keys win)', () => {
    useLiveNodeOverrides.getState().set('n1', { x: 99, y: 'live' })
    const node = { id: 'n1', x: 1, untouched: true }
    const effective = getEffectiveNode(node)
    expect(effective).not.toBe(node) // new reference
    expect(effective).toEqual({ id: 'n1', x: 99, y: 'live', untouched: true } as never)
  })
})
