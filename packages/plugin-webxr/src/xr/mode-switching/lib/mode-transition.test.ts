import { expect, test } from 'bun:test'
import { createModeTransition } from './mode-transition'
import { isGamepadNeutral } from './neutral-input'

test('commit occurs exactly once after a fully opaque frame, then waits for neutral', () => {
  const transition = createModeTransition()
  let commits = 0
  const commit = () => {
    expect(transition.opacity).toBe(1)
    commits++
  }
  expect(transition.start()).toBe(true)
  expect(transition.start()).toBe(false)
  for (let i = 0; i < 4; i++) transition.advance(0.05, true, false, commit)
  expect(transition.phase).toBe('black')
  expect(commits).toBe(0)
  transition.advance(0.05, true, false, commit)
  expect(commits).toBe(1)
  expect(transition.opacity).toBe(1)
  for (let i = 0; i < 10; i++) transition.advance(0.05, true, false, commit)
  expect(transition.phase).toBe('rearm')
  expect(transition.opacity).toBe(0)
  expect(transition.start()).toBe(false)
  for (let i = 0; i < 4; i++) transition.advance(0.05, true, true, commit)
  expect(transition.phase).toBe('idle')
  expect(commits).toBe(1)
  expect(transition.start()).toBe(true)
})

test('focus loss freezes the transition and breaks consecutive neutral time', () => {
  const transition = createModeTransition()
  let commits = 0
  const commit = () => {
    commits++
  }
  transition.start()
  for (let i = 0; i < 4; i++) transition.advance(0.05, true, false, commit)
  for (let i = 0; i < 20; i++) transition.advance(1, false, true, commit)
  expect(commits).toBe(0)
  expect(transition.opacity).toBe(1)
  for (let i = 0; i < 5; i++) transition.advance(0.05, true, false, commit)
  transition.advance(0.05, true, true, commit)
  transition.advance(0.05, false, true, commit)
  transition.advance(0.05, true, true, commit)
  expect(transition.phase).toBe('rearm')
  transition.reset()
  expect(transition.phase).toBe('idle')
  expect(transition.opacity).toBe(0)
})

test('large or invalid deltas cannot skip the fade and black frame', () => {
  const transition = createModeTransition()
  transition.start()
  transition.advance(Number.NaN, true, true, () => {
    throw Error('early commit')
  })
  expect(transition.opacity).toBe(0)
  transition.advance(100, true, true, () => {
    throw Error('early commit')
  })
  expect(transition.phase).toBe('fade-out')
  expect(transition.opacity).toBeLessThan(1)
})

test('grips, triggers, mode buttons and sticks must return to neutral', () => {
  expect(isGamepadNeutral({ axes: [null, null, 0, 0], buttons: [] })).toBe(true)
  expect(isGamepadNeutral({ axes: [null, null, 0.5, 0], buttons: [] })).toBe(
    false,
  )
  expect(isGamepadNeutral({ axes: [Number.NaN], buttons: [] })).toBe(false)
  expect(isGamepadNeutral(undefined)).toBe(true)
  expect(
    isGamepadNeutral({
      axes: [0, 0],
      buttons: [{ pressed: false, touched: true, value: 0 }],
    }),
  ).toBe(true)
  expect(isGamepadNeutral({ axes: [0.2, 0], buttons: [] })).toBe(false)
  expect(
    isGamepadNeutral({
      axes: [],
      buttons: [{ pressed: true, touched: true, value: 1 }],
    }),
  ).toBe(false)
  expect(
    isGamepadNeutral({
      axes: [],
      buttons: [{ pressed: false, touched: true, value: 0.2 }],
    }),
  ).toBe(false)
})
