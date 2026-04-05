import { describe, it, expect, vi, beforeEach } from 'vitest'
import { emitter, eventSuffixes } from '../events/bus'

// Reset emitter listeners between tests to prevent cross-test pollution
beforeEach(() => {
  emitter.all.clear()
})

describe('eventSuffixes', () => {
  it('contains exactly 8 expected event suffix values', () => {
    expect(eventSuffixes).toHaveLength(8)
  })

  it('contains "click"', () => {
    expect(eventSuffixes).toContain('click')
  })

  it('contains "move"', () => {
    expect(eventSuffixes).toContain('move')
  })

  it('contains "enter"', () => {
    expect(eventSuffixes).toContain('enter')
  })

  it('contains "leave"', () => {
    expect(eventSuffixes).toContain('leave')
  })

  it('contains "pointerdown"', () => {
    expect(eventSuffixes).toContain('pointerdown')
  })

  it('contains "pointerup"', () => {
    expect(eventSuffixes).toContain('pointerup')
  })

  it('contains "context-menu"', () => {
    expect(eventSuffixes).toContain('context-menu')
  })

  it('contains "double-click"', () => {
    expect(eventSuffixes).toContain('double-click')
  })

  it('is a readonly tuple (all values are strings)', () => {
    for (const suffix of eventSuffixes) {
      expect(typeof suffix).toBe('string')
    }
  })
})

describe('emitter', () => {
  it('is a mitt instance with on, off, and emit methods', () => {
    expect(typeof emitter.on).toBe('function')
    expect(typeof emitter.off).toBe('function')
    expect(typeof emitter.emit).toBe('function')
  })

  it('has an "all" map for tracking handlers', () => {
    expect(emitter.all).toBeDefined()
    expect(emitter.all instanceof Map).toBe(true)
  })

  it('can subscribe to an event with on() and receive it via emit()', () => {
    const handler = vi.fn()
    emitter.on('tool:cancel', handler)
    emitter.emit('tool:cancel', undefined)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('passes event payload to the listener', () => {
    const handler = vi.fn()
    const payload = { nodeId: 'wall_abc' } as any
    emitter.on('camera-controls:view', handler)
    emitter.emit('camera-controls:view', payload)
    expect(handler).toHaveBeenCalledWith(payload)
  })

  it('can remove a listener with off()', () => {
    const handler = vi.fn()
    emitter.on('tool:cancel', handler)
    emitter.off('tool:cancel', handler)
    emitter.emit('tool:cancel', undefined)
    expect(handler).not.toHaveBeenCalled()
  })

  it('does not call removed listener after off()', () => {
    const handlerA = vi.fn()
    const handlerB = vi.fn()

    emitter.on('tool:cancel', handlerA)
    emitter.on('tool:cancel', handlerB)
    emitter.off('tool:cancel', handlerA)

    emitter.emit('tool:cancel', undefined)

    expect(handlerA).not.toHaveBeenCalled()
    expect(handlerB).toHaveBeenCalledTimes(1)
  })

  it('supports multiple listeners for the same event', () => {
    const handlerA = vi.fn()
    const handlerB = vi.fn()

    emitter.on('tool:cancel', handlerA)
    emitter.on('tool:cancel', handlerB)

    emitter.emit('tool:cancel', undefined)

    expect(handlerA).toHaveBeenCalledTimes(1)
    expect(handlerB).toHaveBeenCalledTimes(1)
  })

  it('does not call listeners registered for a different event', () => {
    const cancelHandler = vi.fn()
    emitter.on('tool:cancel', cancelHandler)

    // Emit a different event
    emitter.emit('camera-controls:top-view', undefined)

    expect(cancelHandler).not.toHaveBeenCalled()
  })

  it('can emit events multiple times and listener is called each time', () => {
    const handler = vi.fn()
    emitter.on('tool:cancel', handler)

    emitter.emit('tool:cancel', undefined)
    emitter.emit('tool:cancel', undefined)
    emitter.emit('tool:cancel', undefined)

    expect(handler).toHaveBeenCalledTimes(3)
  })

  it('clearing all.clear() removes all handlers', () => {
    const handler = vi.fn()
    emitter.on('tool:cancel', handler)

    emitter.all.clear()
    emitter.emit('tool:cancel', undefined)

    expect(handler).not.toHaveBeenCalled()
  })
})
