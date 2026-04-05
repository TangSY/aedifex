import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCommandRegistry } from '../use-command-registry'
import type { CommandAction } from '../use-command-registry'

// Helper to build a minimal CommandAction
function makeAction(overrides: Partial<CommandAction> & { id: string }): CommandAction {
  return {
    label: `Action ${overrides.id}`,
    group: 'test',
    execute: vi.fn(),
    ...overrides,
  }
}

describe('useCommandRegistry', () => {
  // Reset store state between tests
  beforeEach(() => {
    useCommandRegistry.setState({ actions: [] })
  })

  afterEach(() => {
    useCommandRegistry.setState({ actions: [] })
  })

  describe('initial state', () => {
    it('has empty actions array', () => {
      const { actions } = useCommandRegistry.getState()
      expect(actions).toEqual([])
    })
  })

  describe('register()', () => {
    it('adds a command to the registry', () => {
      const action = makeAction({ id: 'cmd.save' })
      useCommandRegistry.getState().register([action])

      const { actions } = useCommandRegistry.getState()
      expect(actions).toHaveLength(1)
      expect(actions[0]).toBe(action)
    })

    it('returns a function (unsubscribe)', () => {
      const action = makeAction({ id: 'cmd.save' })
      const unsubscribe = useCommandRegistry.getState().register([action])
      expect(typeof unsubscribe).toBe('function')
    })

    it('unsubscribe removes the registered command', () => {
      const action = makeAction({ id: 'cmd.save' })
      const unsubscribe = useCommandRegistry.getState().register([action])

      unsubscribe()

      const { actions } = useCommandRegistry.getState()
      expect(actions).toHaveLength(0)
    })

    it('unsubscribe only removes commands with matching IDs', () => {
      const action1 = makeAction({ id: 'cmd.save' })
      const action2 = makeAction({ id: 'cmd.undo' })
      useCommandRegistry.getState().register([action2])
      const unsubscribe = useCommandRegistry.getState().register([action1])

      unsubscribe()

      const { actions } = useCommandRegistry.getState()
      expect(actions).toHaveLength(1)
      expect(actions[0]!.id).toBe('cmd.undo')
    })

    it('replaces an existing command when registering a duplicate ID', () => {
      const original = makeAction({ id: 'cmd.save', label: 'Original Save' })
      useCommandRegistry.getState().register([original])

      const updated = makeAction({ id: 'cmd.save', label: 'Updated Save' })
      useCommandRegistry.getState().register([updated])

      const { actions } = useCommandRegistry.getState()
      expect(actions).toHaveLength(1)
      expect(actions[0]!.label).toBe('Updated Save')
    })

    it('preserves order: existing commands come first, new ones appended', () => {
      const action1 = makeAction({ id: 'cmd.first' })
      const action2 = makeAction({ id: 'cmd.second' })

      useCommandRegistry.getState().register([action1])
      useCommandRegistry.getState().register([action2])

      const { actions } = useCommandRegistry.getState()
      expect(actions).toHaveLength(2)
      expect(actions[0]!.id).toBe('cmd.first')
      expect(actions[1]!.id).toBe('cmd.second')
    })

    it('registers multiple commands in a single call', () => {
      const actions = [
        makeAction({ id: 'cmd.a' }),
        makeAction({ id: 'cmd.b' }),
        makeAction({ id: 'cmd.c' }),
      ]
      useCommandRegistry.getState().register(actions)

      const { actions: stored } = useCommandRegistry.getState()
      expect(stored).toHaveLength(3)
      expect(stored.map((a) => a.id)).toEqual(['cmd.a', 'cmd.b', 'cmd.c'])
    })

    it('unsubscribing a batch removes all commands from that batch', () => {
      const batch = [makeAction({ id: 'cmd.a' }), makeAction({ id: 'cmd.b' })]
      const keeper = makeAction({ id: 'cmd.keeper' })
      useCommandRegistry.getState().register([keeper])
      const unsubscribe = useCommandRegistry.getState().register(batch)

      unsubscribe()

      const { actions } = useCommandRegistry.getState()
      expect(actions).toHaveLength(1)
      expect(actions[0]!.id).toBe('cmd.keeper')
    })

    it('duplicate-ID register filters out the old entry before appending', () => {
      const a = makeAction({ id: 'cmd.x' })
      const b = makeAction({ id: 'cmd.y' })
      useCommandRegistry.getState().register([a, b])

      // Re-register only cmd.x with a replacement
      const aReplaced = makeAction({ id: 'cmd.x', label: 'X v2' })
      useCommandRegistry.getState().register([aReplaced])

      const { actions } = useCommandRegistry.getState()
      // cmd.y should still be there, and cmd.x should be the updated version
      expect(actions).toHaveLength(2)
      const ids = actions.map((a) => a.id)
      expect(ids).toContain('cmd.x')
      expect(ids).toContain('cmd.y')
      const xAction = actions.find((a) => a.id === 'cmd.x')
      expect(xAction?.label).toBe('X v2')
    })
  })
})
