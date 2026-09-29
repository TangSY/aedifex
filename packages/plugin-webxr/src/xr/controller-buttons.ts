type ControllerButtonState = {
  gamepad?: Record<string, { state?: string } | undefined>
  inputSource: { gamepad?: { buttons: ArrayLike<{ pressed?: boolean }> } }
}

function isPressed(controller: ControllerButtonState | undefined, name: string, index: number) {
  return (
    controller?.gamepad?.[name]?.state === 'pressed' ||
    controller?.inputSource.gamepad?.buttons[index]?.pressed === true
  )
}

export function isQuestXPressed(controller: ControllerButtonState | undefined) {
  return isPressed(controller, 'x-button', 4)
}

export function isQuestYPressed(controller: ControllerButtonState | undefined) {
  return isPressed(controller, 'y-button', 5)
}
