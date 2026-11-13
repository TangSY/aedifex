import { afterEach, expect, test } from 'bun:test'
import { usePrecisePlacement } from '../../store/use-precise-placement'
import { installPreciseWallKeys } from './floorplan-precise-wall-keys'

const target = new EventTarget() as Window
const emit = (key: string) => {
  const event = Object.assign(new Event('keydown', { cancelable: true }), {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    isComposing: false,
  })
  target.dispatchEvent(event)
  return event
}
afterEach(() => usePrecisePlacement.getState().clear())

test('2D keyboard entry consumes its keys, commits once and preserves the pointer', () => {
  const calls: Array<[number, number]> = []
  const stop = installPreciseWallKeys({
    target,
    draft: () => ({
      start: [1, 1],
      pointer: [1, 1],
      unit: 'metric',
      metricNotation: 'meters',
      locale: 'en',
    }),
    commit: (point) => calls.push(point),
  })
  try {
    for (const key of ['2', 'Tab', '9', '0']) expect(emit(key).defaultPrevented).toBe(true)
    expect(emit('Enter').defaultPrevented).toBe(true)
    expect(calls).toEqual([[1, 1]])
  } finally {
    stop()
  }
  expect(emit('2').defaultPrevented).toBe(false)
})

test('invalid and directionless entries cannot commit; escape preserves the draft', () => {
  let calls = 0
  const stop = installPreciseWallKeys({
    target,
    draft: () => ({
      start: [0, 0],
      pointer: [0, 0],
      unit: 'metric',
      metricNotation: 'meters',
      locale: 'en',
    }),
    commit: () => {
      calls++
    },
  })
  try {
    emit('2')
    emit('Enter')
    expect(calls).toBe(0)
    expect(usePrecisePlacement.getState().fields[0]).toBe('2')
    emit('Escape')
    expect(usePrecisePlacement.getState().kind).toBeNull()
    expect(calls).toBe(0)
  } finally {
    stop()
  }
})

test('inactive views leave keyboard shortcuts untouched', () => {
  const stop = installPreciseWallKeys({
    target,
    draft: () => null,
    commit: () => {
      throw new Error('unexpected')
    },
  })
  try {
    expect(emit('1').defaultPrevented).toBe(false)
  } finally {
    stop()
  }
})
