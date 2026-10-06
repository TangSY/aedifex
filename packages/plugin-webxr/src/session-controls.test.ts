import { test } from 'bun:test'
import assert from 'node:assert/strict'
import { useWebXRSessionControls, type WebXRSessionControls } from './session-controls'

const controls: WebXRSessionControls = {
  ready: true, unavailable: false, active: false, entering: false, error: null,
  enter: async () => {}, exit: async () => {},
}

test('sidebar commands use the published session and receive status updates', async () => {
  const owner = {}
  let entered = 0
  const enter = async () => { entered++ }
  useWebXRSessionControls.getState().publish(owner, { ...controls, enter })
  await useWebXRSessionControls.getState().controls?.enter()
  assert.equal(entered, 1)
  useWebXRSessionControls.getState().publish(owner, { ...controls, active: true })
  assert.equal(useWebXRSessionControls.getState().controls?.active, true)
  useWebXRSessionControls.getState().clear(owner)
  assert.equal(useWebXRSessionControls.getState().controls, null)
})

test('an old session cleanup cannot remove the current session controls', () => {
  const old = {}, current = {}
  useWebXRSessionControls.getState().publish(old, controls)
  useWebXRSessionControls.getState().publish(current, controls)
  useWebXRSessionControls.getState().clear(old)
  assert.equal(useWebXRSessionControls.getState().owner, current)
  useWebXRSessionControls.getState().clear(current)
})

test('starting view survives session cleanup', () => {
  const owner = {}
  useWebXRSessionControls.getState().setStartingMode('human')
  useWebXRSessionControls.getState().publish(owner, controls)
  useWebXRSessionControls.getState().clear(owner)
  assert.equal(useWebXRSessionControls.getState().startingMode, 'human')
  useWebXRSessionControls.getState().setStartingMode('god')
})
