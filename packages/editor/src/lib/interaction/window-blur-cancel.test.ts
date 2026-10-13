import { describe, expect, test } from 'bun:test'
import { bindWindowBlurCancel } from './window-blur-cancel'

describe('bindWindowBlurCancel', () => {
  test('cancels an active interaction on blur and detaches cleanly', () => {
    const target = new EventTarget()
    let calls = 0
    const unbind = bindWindowBlurCancel(() => {
      calls += 1
    }, target)

    target.dispatchEvent(new Event('blur'))
    expect(calls).toBe(1)

    unbind()
    target.dispatchEvent(new Event('blur'))
    expect(calls).toBe(1)
  })
})
