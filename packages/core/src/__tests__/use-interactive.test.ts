import { describe, it, expect, beforeEach } from 'vitest'
import { useInteractive } from '../store/use-interactive'
import type { Interactive } from '../schema/nodes/item'
import type { AnyNodeId } from '../schema/types'

// ============================================================================
// Helpers
// ============================================================================

function makeToggleInteractive(defaultValue?: boolean): Interactive {
  return {
    controls: [
      {
        kind: 'toggle',
        label: 'On/Off',
        ...(defaultValue !== undefined ? { default: defaultValue } : {}),
      },
    ],
    effects: [],
  }
}

function makeSliderInteractive(min: number, max: number, defaultValue?: number): Interactive {
  return {
    controls: [
      {
        kind: 'slider',
        label: 'Brightness',
        min,
        max,
        step: 1,
        displayMode: 'slider',
        ...(defaultValue !== undefined ? { default: defaultValue } : {}),
      },
    ],
    effects: [],
  }
}

function makeTemperatureInteractive(min: number, max: number, defaultValue?: number): Interactive {
  return {
    controls: [
      {
        kind: 'temperature',
        label: 'Temperature',
        min,
        max,
        unit: 'C',
        ...(defaultValue !== undefined ? { default: defaultValue } : {}),
      },
    ],
    effects: [],
  }
}

// Reset Zustand store state between tests
beforeEach(() => {
  useInteractive.setState({ items: {} })
})

// ============================================================================
// Tests
// ============================================================================

describe('useInteractive store', () => {
  describe('initItem', () => {
    it('creates state with correct default value for toggle (no default set)', () => {
      const interactive = makeToggleInteractive()
      useInteractive.getState().initItem('item_001' as AnyNodeId, interactive)
      const state = useInteractive.getState().items['item_001' as AnyNodeId]

      expect(state).toBeDefined()
      expect(state!.controlValues).toHaveLength(1)
      expect(state!.controlValues[0]).toBe(false)
    })

    it('creates state with correct default value for toggle (default=true)', () => {
      const interactive = makeToggleInteractive(true)
      useInteractive.getState().initItem('item_002' as AnyNodeId, interactive)
      const state = useInteractive.getState().items['item_002' as AnyNodeId]

      expect(state!.controlValues[0]).toBe(true)
    })

    it('creates state with correct default value for slider (no default — falls back to min)', () => {
      const interactive = makeSliderInteractive(10, 100)
      useInteractive.getState().initItem('item_003' as AnyNodeId, interactive)
      const state = useInteractive.getState().items['item_003' as AnyNodeId]

      expect(state!.controlValues[0]).toBe(10)
    })

    it('creates state with correct default value for slider (explicit default)', () => {
      const interactive = makeSliderInteractive(0, 100, 75)
      useInteractive.getState().initItem('item_004' as AnyNodeId, interactive)
      const state = useInteractive.getState().items['item_004' as AnyNodeId]

      expect(state!.controlValues[0]).toBe(75)
    })

    it('creates state with correct default value for temperature (no default — falls back to min)', () => {
      const interactive = makeTemperatureInteractive(16, 30)
      useInteractive.getState().initItem('item_005' as AnyNodeId, interactive)
      const state = useInteractive.getState().items['item_005' as AnyNodeId]

      expect(state!.controlValues[0]).toBe(16)
    })

    it('creates state with correct default value for temperature (explicit default)', () => {
      const interactive = makeTemperatureInteractive(16, 30, 22)
      useInteractive.getState().initItem('item_006' as AnyNodeId, interactive)
      const state = useInteractive.getState().items['item_006' as AnyNodeId]

      expect(state!.controlValues[0]).toBe(22)
    })

    it('is idempotent — second call does not overwrite existing state', () => {
      const interactive = makeToggleInteractive(false)
      const itemId = 'item_007' as AnyNodeId

      useInteractive.getState().initItem(itemId, interactive)
      // Mutate the value manually
      useInteractive.getState().setControlValue(itemId, 0, true)
      // Call initItem again
      useInteractive.getState().initItem(itemId, interactive)

      const state = useInteractive.getState().items[itemId]
      // Should remain true (not reset to false by the second initItem)
      expect(state!.controlValues[0]).toBe(true)
    })

    it('skips initialization for empty controls array', () => {
      const interactive: Interactive = { controls: [], effects: [] }
      const itemId = 'item_008' as AnyNodeId

      useInteractive.getState().initItem(itemId, interactive)

      expect(useInteractive.getState().items[itemId]).toBeUndefined()
    })

    it('initializes multiple controls with correct defaults', () => {
      const interactive: Interactive = {
        controls: [
          { kind: 'toggle', label: 'Power' },
          { kind: 'slider', label: 'Speed', min: 1, max: 5, step: 1, displayMode: 'slider' },
          { kind: 'temperature', label: 'Temp', min: 18, max: 28, unit: 'C' },
        ],
        effects: [],
      }
      const itemId = 'item_009' as AnyNodeId
      useInteractive.getState().initItem(itemId, interactive)
      const state = useInteractive.getState().items[itemId]

      expect(state!.controlValues).toHaveLength(3)
      expect(state!.controlValues[0]).toBe(false) // toggle default
      expect(state!.controlValues[1]).toBe(1)     // slider min
      expect(state!.controlValues[2]).toBe(18)    // temperature min
    })
  })

  describe('setControlValue', () => {
    it('updates the value at a specific control index', () => {
      const interactive = makeSliderInteractive(0, 100, 0)
      const itemId = 'item_010' as AnyNodeId

      useInteractive.getState().initItem(itemId, interactive)
      useInteractive.getState().setControlValue(itemId, 0, 80)

      expect(useInteractive.getState().items[itemId]!.controlValues[0]).toBe(80)
    })

    it('updates only the targeted index, leaving others unchanged', () => {
      const interactive: Interactive = {
        controls: [
          { kind: 'toggle', label: 'A' },
          { kind: 'slider', label: 'B', min: 0, max: 10, step: 1, displayMode: 'slider' },
        ],
        effects: [],
      }
      const itemId = 'item_011' as AnyNodeId

      useInteractive.getState().initItem(itemId, interactive)
      useInteractive.getState().setControlValue(itemId, 1, 7)

      const values = useInteractive.getState().items[itemId]!.controlValues
      expect(values[0]).toBe(false) // unchanged toggle
      expect(values[1]).toBe(7)
    })

    it('silently ignores setControlValue for a non-existent item', () => {
      expect(() => {
        useInteractive.getState().setControlValue('nonexistent_item' as AnyNodeId, 0, true)
      }).not.toThrow()

      expect(useInteractive.getState().items['nonexistent_item' as AnyNodeId]).toBeUndefined()
    })
  })

  describe('removeItem', () => {
    it('removes item state from the store', () => {
      const interactive = makeToggleInteractive()
      const itemId = 'item_012' as AnyNodeId

      useInteractive.getState().initItem(itemId, interactive)
      expect(useInteractive.getState().items[itemId]).toBeDefined()

      useInteractive.getState().removeItem(itemId)
      expect(useInteractive.getState().items[itemId]).toBeUndefined()
    })

    it('does not throw when removing a non-existent item', () => {
      expect(() => {
        useInteractive.getState().removeItem('ghost_item' as AnyNodeId)
      }).not.toThrow()
    })

    it('does not affect other items when removing one', () => {
      const interactive = makeToggleInteractive()
      const itemA = 'item_A' as AnyNodeId
      const itemB = 'item_B' as AnyNodeId

      useInteractive.getState().initItem(itemA, interactive)
      useInteractive.getState().initItem(itemB, interactive)

      useInteractive.getState().removeItem(itemA)

      expect(useInteractive.getState().items[itemA]).toBeUndefined()
      expect(useInteractive.getState().items[itemB]).toBeDefined()
    })
  })

  describe('multiple independent items', () => {
    it('manages state for multiple items independently', () => {
      const itemA = 'item_multi_A' as AnyNodeId
      const itemB = 'item_multi_B' as AnyNodeId

      const toggleInteractive = makeToggleInteractive(false)
      const sliderInteractive = makeSliderInteractive(0, 10, 5)

      useInteractive.getState().initItem(itemA, toggleInteractive)
      useInteractive.getState().initItem(itemB, sliderInteractive)

      useInteractive.getState().setControlValue(itemA, 0, true)

      expect(useInteractive.getState().items[itemA]!.controlValues[0]).toBe(true)
      expect(useInteractive.getState().items[itemB]!.controlValues[0]).toBe(5) // unchanged
    })
  })
})
