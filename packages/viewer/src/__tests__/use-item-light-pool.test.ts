import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// requestAnimationFrame is not available in the Node test environment — stub
// it before Zustand (or any store) is imported, because Zustand's subscribeWithSelector
// middleware may schedule micro-tasks via rAF in some environments.
// ---------------------------------------------------------------------------
vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
  cb(0)
  return 0
})

import type { AnyNodeId, Interactive, LightEffect } from '@aedifex/core'
import { useItemLightPool } from '../store/use-item-light-pool'

// ===========================================================================
// Test data factories
// ===========================================================================

/** Minimal valid LightEffect */
function makeLightEffect(overrides?: Partial<LightEffect>): LightEffect {
  return {
    kind: 'light',
    color: '#ffffff',
    intensityRange: [0, 1],
    offset: [0, 0, 0],
    ...overrides,
  }
}

/** Interactive descriptor with an explicit set of controls */
function makeInteractive(controls: Interactive['controls'] = []): Interactive {
  return { controls, effects: [] }
}

/** A dummy node id that satisfies AnyNodeId typing */
function makeNodeId(suffix: string = '1'): AnyNodeId {
  return `item_${suffix}` as AnyNodeId
}

// ===========================================================================
// Shared reset
// ===========================================================================

beforeEach(() => {
  // Reset the Zustand store to its initial state before every test so
  // tests do not bleed registrations into each other.
  useItemLightPool.setState({ registrations: new Map() })
})

// ===========================================================================
// Initial state
// ===========================================================================

describe('useItemLightPool — initial state', () => {
  it('starts with an empty registrations map', () => {
    const { registrations } = useItemLightPool.getState()
    expect(registrations).toBeInstanceOf(Map)
    expect(registrations.size).toBe(0)
  })
})

// ===========================================================================
// register
// ===========================================================================

describe('useItemLightPool.register', () => {
  it('adds a registration entry under the given key', () => {
    const { register } = useItemLightPool.getState()
    const effect = makeLightEffect()
    const interactive = makeInteractive()

    register('key-a', makeNodeId(), effect, interactive)

    const { registrations } = useItemLightPool.getState()
    expect(registrations.has('key-a')).toBe(true)
  })

  it('stores the correct nodeId and effect on the registration', () => {
    const { register } = useItemLightPool.getState()
    const nodeId = makeNodeId('node42')
    const effect = makeLightEffect({ color: '#ff0000' })

    register('key-b', nodeId, effect, makeInteractive())

    const reg = useItemLightPool.getState().registrations.get('key-b')!
    expect(reg.nodeId).toBe(nodeId)
    expect(reg.effect).toEqual(effect)
  })

  it('finds the correct toggleIndex when a toggle control is present', () => {
    const { register } = useItemLightPool.getState()
    const interactive = makeInteractive([
      { kind: 'slider', label: 'Brightness', min: 0, max: 100, step: 1, displayMode: 'slider' },
      { kind: 'toggle' },
    ])

    register('key-toggle', makeNodeId(), makeLightEffect(), interactive)

    const reg = useItemLightPool.getState().registrations.get('key-toggle')!
    expect(reg.toggleIndex).toBe(1)
  })

  it('finds the correct sliderIndex when a slider control is present', () => {
    const { register } = useItemLightPool.getState()
    const interactive = makeInteractive([
      { kind: 'toggle' },
      { kind: 'slider', label: 'Dim', min: 10, max: 90, step: 5, displayMode: 'slider' },
    ])

    register('key-slider', makeNodeId(), makeLightEffect(), interactive)

    const reg = useItemLightPool.getState().registrations.get('key-slider')!
    expect(reg.sliderIndex).toBe(1)
  })

  it('sets toggleIndex to -1 when no toggle control is present', () => {
    const { register } = useItemLightPool.getState()
    const interactive = makeInteractive([
      { kind: 'slider', label: 'Intensity', min: 0, max: 1, step: 0.1, displayMode: 'slider' },
    ])

    register('key-no-toggle', makeNodeId(), makeLightEffect(), interactive)

    const reg = useItemLightPool.getState().registrations.get('key-no-toggle')!
    expect(reg.toggleIndex).toBe(-1)
  })

  it('sets hasSlider=false when no slider control is present', () => {
    const { register } = useItemLightPool.getState()
    const interactive = makeInteractive([{ kind: 'toggle' }])

    register('key-no-slider', makeNodeId(), makeLightEffect(), interactive)

    const reg = useItemLightPool.getState().registrations.get('key-no-slider')!
    expect(reg.hasSlider).toBe(false)
  })

  it('sets sliderMin=0 and sliderMax=1 when no slider control is present', () => {
    const { register } = useItemLightPool.getState()
    const interactive = makeInteractive([{ kind: 'toggle' }])

    register('key-defaults', makeNodeId(), makeLightEffect(), interactive)

    const reg = useItemLightPool.getState().registrations.get('key-defaults')!
    expect(reg.sliderMin).toBe(0)
    expect(reg.sliderMax).toBe(1)
  })

  it('sets hasSlider=true when a slider control is present', () => {
    const { register } = useItemLightPool.getState()
    const interactive = makeInteractive([
      { kind: 'slider', label: 'Level', min: 0, max: 100, step: 1, displayMode: 'slider' },
    ])

    register('key-has-slider', makeNodeId(), makeLightEffect(), interactive)

    const reg = useItemLightPool.getState().registrations.get('key-has-slider')!
    expect(reg.hasSlider).toBe(true)
  })

  it("uses the slider control's min and max values", () => {
    const { register } = useItemLightPool.getState()
    const interactive = makeInteractive([
      { kind: 'slider', label: 'Kelvin', min: 2700, max: 6500, step: 100, displayMode: 'slider' },
    ])

    register('key-min-max', makeNodeId(), makeLightEffect(), interactive)

    const reg = useItemLightPool.getState().registrations.get('key-min-max')!
    expect(reg.sliderMin).toBe(2700)
    expect(reg.sliderMax).toBe(6500)
  })

  it('uses the FIRST slider control when multiple sliders are present', () => {
    const { register } = useItemLightPool.getState()
    const interactive = makeInteractive([
      { kind: 'slider', label: 'First', min: 1, max: 5, step: 1, displayMode: 'slider' },
      { kind: 'slider', label: 'Second', min: 10, max: 50, step: 5, displayMode: 'slider' },
    ])

    register('key-multi-slider', makeNodeId(), makeLightEffect(), interactive)

    const reg = useItemLightPool.getState().registrations.get('key-multi-slider')!
    expect(reg.sliderMin).toBe(1)
    expect(reg.sliderMax).toBe(5)
  })

  it('overwrites the previous registration when re-registering with the same key', () => {
    const { register } = useItemLightPool.getState()
    const nodeId1 = makeNodeId('first')
    const nodeId2 = makeNodeId('second')

    register('key-overwrite', nodeId1, makeLightEffect({ color: '#aaaaaa' }), makeInteractive())
    register('key-overwrite', nodeId2, makeLightEffect({ color: '#bbbbbb' }), makeInteractive())

    const { registrations } = useItemLightPool.getState()
    expect(registrations.size).toBe(1)
    const reg = registrations.get('key-overwrite')!
    expect(reg.nodeId).toBe(nodeId2)
    expect(reg.effect.color).toBe('#bbbbbb')
  })
})

// ===========================================================================
// unregister
// ===========================================================================

describe('useItemLightPool.unregister', () => {
  it('removes a previously registered key', () => {
    const { register, unregister } = useItemLightPool.getState()

    register('key-remove', makeNodeId(), makeLightEffect(), makeInteractive())
    expect(useItemLightPool.getState().registrations.has('key-remove')).toBe(true)

    unregister('key-remove')
    expect(useItemLightPool.getState().registrations.has('key-remove')).toBe(false)
  })

  it('does not throw when unregistering a key that was never registered', () => {
    const { unregister } = useItemLightPool.getState()

    expect(() => unregister('key-nonexistent')).not.toThrow()
  })

  it('leaves the map empty when the only registration is unregistered', () => {
    const { register, unregister } = useItemLightPool.getState()

    register('sole-key', makeNodeId(), makeLightEffect(), makeInteractive())
    unregister('sole-key')

    expect(useItemLightPool.getState().registrations.size).toBe(0)
  })

  it('only removes the targeted key, leaving others intact', () => {
    const { register, unregister } = useItemLightPool.getState()

    register('keep-a', makeNodeId('a'), makeLightEffect(), makeInteractive())
    register('keep-b', makeNodeId('b'), makeLightEffect(), makeInteractive())
    register('remove-c', makeNodeId('c'), makeLightEffect(), makeInteractive())

    unregister('remove-c')

    const { registrations } = useItemLightPool.getState()
    expect(registrations.has('keep-a')).toBe(true)
    expect(registrations.has('keep-b')).toBe(true)
    expect(registrations.has('remove-c')).toBe(false)
  })
})

// ===========================================================================
// Multiple independent registrations
// ===========================================================================

describe('useItemLightPool — multiple registrations', () => {
  it('maintains multiple registrations independently with correct fields', () => {
    const { register } = useItemLightPool.getState()

    const nodeA = makeNodeId('a')
    const nodeB = makeNodeId('b')
    const effectA = makeLightEffect({ color: '#ff0000', intensityRange: [0, 2] })
    const effectB = makeLightEffect({ color: '#0000ff', intensityRange: [1, 5] })
    const interactiveA = makeInteractive([{ kind: 'toggle' }])
    const interactiveB = makeInteractive([
      { kind: 'slider', label: 'Dim', min: 5, max: 95, step: 5, displayMode: 'slider' },
    ])

    register('light-a', nodeA, effectA, interactiveA)
    register('light-b', nodeB, effectB, interactiveB)

    const { registrations } = useItemLightPool.getState()
    expect(registrations.size).toBe(2)

    const regA = registrations.get('light-a')!
    expect(regA.nodeId).toBe(nodeA)
    expect(regA.effect.color).toBe('#ff0000')
    expect(regA.toggleIndex).toBe(0)
    expect(regA.hasSlider).toBe(false)
    expect(regA.sliderMin).toBe(0)
    expect(regA.sliderMax).toBe(1)

    const regB = registrations.get('light-b')!
    expect(regB.nodeId).toBe(nodeB)
    expect(regB.effect.color).toBe('#0000ff')
    expect(regB.sliderIndex).toBe(0)
    expect(regB.hasSlider).toBe(true)
    expect(regB.sliderMin).toBe(5)
    expect(regB.sliderMax).toBe(95)
  })

  it('registrations map is a new Map instance after each mutation (immutable update)', () => {
    const { register } = useItemLightPool.getState()

    register('first', makeNodeId(), makeLightEffect(), makeInteractive())
    const mapAfterFirst = useItemLightPool.getState().registrations

    register('second', makeNodeId(), makeLightEffect(), makeInteractive())
    const mapAfterSecond = useItemLightPool.getState().registrations

    // Zustand should have produced a new Map reference on each setState call
    expect(mapAfterFirst).not.toBe(mapAfterSecond)
  })
})
