import { expect, test } from 'bun:test'
import { useXRWorkspace } from './workspace-store'

function withWorkspace(check: () => void) {
  const initial = useXRWorkspace.getState()
  try {
    useXRWorkspace.setState({ visible: true })
    check()
  } finally {
    useXRWorkspace.setState(initial, true)
  }
}

test('selection preserves the offset while manual rescue resets it and shows the panel', () => {
  withWorkspace(() => {
    const initial = useXRWorkspace.getState()
    initial.recall('selection')
    expect(useXRWorkspace.getState().resetPositionRequest).toBe(initial.resetPositionRequest)
    useXRWorkspace.getState().hide()
    useXRWorkspace.getState().recall()
    expect(useXRWorkspace.getState().visible).toBe(true)
    expect(useXRWorkspace.getState().resetPositionRequest).toBe(initial.resetPositionRequest + 1)
    expect(useXRWorkspace.getState().recallRequest).toBe(initial.recallRequest + 2)
    expect(useXRWorkspace.getState().recallReason).toBe('manual')
  })
})

test('hidden panels stay hidden through selection and mode switches, then show with a full reset', () => {
  withWorkspace(() => {
    useXRWorkspace.getState().toggle()
    const hidden = useXRWorkspace.getState()
    expect(hidden.visible).toBe(false)
    hidden.recall('selection')
    useXRWorkspace.getState().modeChanged()
    expect(useXRWorkspace.getState()).toBe(hidden)
    useXRWorkspace.getState().toggle()
    const shown = useXRWorkspace.getState()
    expect(shown.visible).toBe(true)
    expect(shown.recallReason).toBe('manual')
    expect(shown.recallRequest).toBe(hidden.recallRequest + 1)
    expect(shown.resetPositionRequest).toBe(hidden.resetPositionRequest + 1)
  })
})

test('switching modes with a visible panel requests full recovery', () => {
  withWorkspace(() => {
    const before = useXRWorkspace.getState()
    before.modeChanged()
    expect(useXRWorkspace.getState().visible).toBe(true)
    expect(useXRWorkspace.getState().recallRequest).toBe(before.recallRequest + 1)
    expect(useXRWorkspace.getState().resetPositionRequest).toBe(before.resetPositionRequest + 1)
  })
})

test('resetting only the offset preserves a pending selection recall', () => {
  withWorkspace(() => {
    useXRWorkspace.getState().recall('selection')
    const before = useXRWorkspace.getState()
    before.resetPanelPosition()
    expect(useXRWorkspace.getState().recallRequest).toBe(before.recallRequest)
    expect(useXRWorkspace.getState().recallReason).toBe('selection')
    expect(useXRWorkspace.getState().resetPositionRequest).toBe(before.resetPositionRequest + 1)
  })
})
