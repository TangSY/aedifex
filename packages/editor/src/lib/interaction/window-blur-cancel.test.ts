import { describe, expect, test, vi } from 'vitest'
import { bindWindowBlurCancel } from './window-blur-cancel'

describe('bindWindowBlurCancel', () => {
  test('cancels an active interaction on blur and detaches cleanly', () => {
    const target = new EventTarget()
    const cancel = vi.fn()
    const unbind = bindWindowBlurCancel(cancel, target)

    target.dispatchEvent(new Event('blur'))
    expect(cancel).toHaveBeenCalledTimes(1)

    unbind()
    target.dispatchEvent(new Event('blur'))
    expect(cancel).toHaveBeenCalledTimes(1)
  })
})
