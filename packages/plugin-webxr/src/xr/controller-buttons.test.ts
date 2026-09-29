import { describe, expect, test } from 'bun:test'
import { isQuestXPressed, isQuestYPressed } from './controller-buttons'

function controller(buttons: boolean[]) {
  return {
    inputSource: { gamepad: { buttons: buttons.map((pressed) => ({ pressed })) } },
  }
}

describe('Quest face-button mapping', () => {
  test('maps X to index 4 and Y to index 5 in the WebXR standard layout', () => {
    expect(isQuestXPressed(controller([false, false, false, false, true, false]))).toBe(true)
    expect(isQuestYPressed(controller([false, false, false, false, false, true]))).toBe(true)
    expect(isQuestXPressed(controller([false, false, false, true, false, false]))).toBe(false)
  })

  test('prefers the named runtime button state when available', () => {
    expect(
      isQuestXPressed({
        gamepad: { 'x-button': { state: 'pressed' } },
        inputSource: {},
      }),
    ).toBe(true)
  })
})
