import { expect, test } from 'bun:test'
import { Vector3 } from 'three'
import { createEntryTargeting } from './entry-targeting'
import { useXRPlayerMode } from '../store/player-mode'

test('retarget ignores the UI ray, follows a new floor, then preserves it while confirming', () => {
  const target = createEntryTargeting()
  const first = { point: new Vector3(1, 0, 1), source: 'aim' as const }
  const second = { point: new Vector3(4, 3, -2), source: 'aim' as const }
  target.update(first, 0, false, false)
  target.retarget()
  expect(target.update(first, 0, true, false)).toBeNull()
  expect(target.update(second, 1, false, false)?.destination).toBe(second)
  expect(target.update(null, 0, true, false)?.destination).toBe(second)
  expect(target.update(first, 0, false, true)?.destination).toBe(second)
})

test('invalid world aim clears stale target instead of silently entering the previous floor', () => {
  const target = createEntryTargeting()
  target.update({ point: new Vector3(), source: 'aim' }, 0, false, false)
  expect(target.update(null, 0, false, false)).toBeNull()
})

test('retarget then enter survives a status refresh in the same frame', () => {
  const mode = useXRPlayerMode.getState()
  mode.reset()
  mode.setMode('human')
  const target = createEntryTargeting()
  target.retarget()
  target.update({ point: new Vector3(2, 0, 3), source: 'aim' }, 0, false, false)
  target.place(target.selected!.destination, 0, false)
  mode.placeEntry()
  mode.setMode('human')
  target.update(null, 0, true, true)
  mode.setEntryMessage('Floor selected')
  expect(target.selected).not.toBeNull()
  mode.setTransitionPhase('black')
  mode.completeEntry()
  expect(useXRPlayerMode.getState().mode).toBe('human')
  mode.reset()
})

test('only an explicit valid placement locks a copied destination until Replace', () => {
  const target = createEntryTargeting()
  const destination = { point: new Vector3(2, 1, 3), source: 'aim' as const }
  target.update(destination, 0, false, false)
  expect(target.placed).toBe(false)
  expect(target.place(null, 0, false)).toBe(false)
  expect(target.place(destination, 0, true)).toBe(false)
  expect(target.place(destination, 1, false)).toBe(true)
  destination.point.set(8, 8, 8)
  target.update(null, 0, false, false)
  expect(target.selected?.destination.point.toArray()).toEqual([2, 1, 3])
  expect(target.selected?.yaw).toBe(1)
  expect(target.place(destination, 0, false)).toBe(false)
  target.retarget()
  expect(target.placed).toBe(false)
  expect(target.selected).toBeNull()
  expect(target.place(destination, 0, false)).toBe(true)
})
