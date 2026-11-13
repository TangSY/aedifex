import { afterEach, beforeEach, expect, test } from 'bun:test'
import { routePreciseKey, usePrecisePlacement } from './use-precise-placement'

const key = (key: string, options = {}) =>
  routePreciseKey({
    event: { key, ctrlKey: false, metaKey: false, altKey: false, isComposing: false, ...options },
    kind: 'wall',
  })
beforeEach(() => usePrecisePlacement.getState().clear())
afterEach(() => usePrecisePlacement.getState().clear())

test('starts on a digit, switches fields, edits and submits without clearing', () => {
  expect(key('2')).toBe('changed')
  expect(key('m')).toBe('changed')
  expect(key('Tab')).toBe('changed')
  expect(key('9')).toBe('changed')
  expect(key('0')).toBe('changed')
  expect(usePrecisePlacement.getState().fields).toEqual(['2m', '90'])
  expect(key('Backspace')).toBe('changed')
  expect(key('Enter')).toBe('submit')
  expect(usePrecisePlacement.getState().fields).toEqual(['2m', '9'])
})

test('escape ends the entry only; shortcuts and IME remain untouched', () => {
  expect(key('a')).toBeNull()
  expect(key('1', { ctrlKey: true })).toBeNull()
  expect(key('1', { isComposing: true })).toBeNull()
  expect(key('Tab')).toBe('changed')
  expect(usePrecisePlacement.getState().active).toBe(1)
  expect(key('Escape')).toBe('cancelled')
  expect(usePrecisePlacement.getState().kind).toBeNull()
  expect(key('Escape')).toBeNull()
})

test('a different tool cannot consume or alter the active entry', () => {
  key('2')
  expect(
    routePreciseKey({
      kind: 'cabinet',
      event: { key: '3', ctrlKey: false, metaKey: false, altKey: false, isComposing: false },
    }),
  ).toBeNull()
  expect(usePrecisePlacement.getState().fields).toEqual(['2', ''])
})

test('a tool can retain its existing Tab shortcut until precise input starts', () => {
  const cabinetKey = (key: string) =>
    routePreciseKey({
      kind: 'cabinet',
      allowTabStart: false,
      event: { key, ctrlKey: false, metaKey: false, altKey: false, isComposing: false },
    })
  expect(cabinetKey('Tab')).toBeNull()
  expect(usePrecisePlacement.getState().kind).toBeNull()
  expect(cabinetKey('1')).toBe('changed')
  expect(cabinetKey('Tab')).toBe('changed')
  expect(usePrecisePlacement.getState().active).toBe(1)
})
