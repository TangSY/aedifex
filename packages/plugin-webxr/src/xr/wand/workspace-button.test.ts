import { expect, test } from 'bun:test'
import { WorkspaceButton } from './workspace-button'

test('a short Y press toggles only on release', () => {
  const button = new WorkspaceButton()
  expect(button.update(false, 0.01)).toBeUndefined()
  expect(button.update(true, 0.01)).toBeUndefined()
  expect(button.update(true, 0.2)).toBeUndefined()
  expect(button.update(false, 0.01)).toBe('toggle')
  expect(button.update(false, 0.01)).toBeUndefined()
})

test('holding Y rescues once and does not toggle on release', () => {
  const button = new WorkspaceButton()
  button.update(true, 0.01)
  expect(button.update(true, 0.64)).toBeUndefined()
  expect(button.update(true, 0.02)).toBe('rescue')
  expect(button.update(true, 2)).toBeUndefined()
  expect(button.update(false, 0.01)).toBeUndefined()
  button.update(true, 0.01)
  expect(button.update(false, 0.01)).toBe('toggle')
})

test('tracking or session interruption cancels a pending toggle', () => {
  const button = new WorkspaceButton()
  button.update(true, 0.01)
  button.update(true, 0.3)
  button.reset()
  expect(button.update(false, 0.01)).toBeUndefined()
})
