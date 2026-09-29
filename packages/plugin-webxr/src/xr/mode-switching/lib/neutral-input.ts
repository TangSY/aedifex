import { PALM_GRAB_RELEASE_EXTENSION } from '../../god-mode/lib/palm-grab'
import { HAND_PINCH_RELEASE_DISTANCE } from '../../human-mode/constants/human-mode-constants'

type Point = { x: number; y: number; z: number }
const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

export function isGamepadNeutral(
  gamepad:
    | {
        buttons: readonly GamepadButton[]
        axes: readonly (number | null)[]
      }
    | null
    | undefined,
) {
  return (
    !gamepad ||
    (gamepad.buttons.every((b) => !b.pressed && b.value <= 0.1) &&
      // IWER uses null for unmapped axes; native XR-standard gamepads use zero.
      gamepad.axes.every(
        (axis) =>
          axis === null || (Number.isFinite(axis) && Math.abs(axis) <= 0.1),
      ))
  )
}

/** Missing tracking is not evidence of a release. Uses raw XR joints, independent of UI render order. */
export function areXRInputsNeutral(
  sources: Iterable<XRInputSource>,
  frame: XRFrame,
  space: XRReferenceSpace,
) {
  const thumbs: Point[] = []
  for (const source of sources) {
    if (!isGamepadNeutral(source.gamepad)) return false
    if (!frame.getPose(source.targetRaySpace, space)) return false
    if (!source.hand) continue
    const point = (name: XRHandJoint) => {
      const joint = source.hand!.get(name)
      return joint && frame.getJointPose?.(joint, space)?.transform.position
    }
    const thumb = point('thumb-tip')
    const index = point('index-finger-tip')
    const middle = point('middle-finger-tip')
    const wrist = point('wrist')
    if (!thumb || !index || !middle || !wrist) return false
    if (
      distance(thumb, index) <= HAND_PINCH_RELEASE_DISTANCE ||
      distance(thumb, middle) <= HAND_PINCH_RELEASE_DISTANCE
    )
      return false
    thumbs.push(thumb)
    let curled = true
    for (const finger of ['middle', 'ring', 'pinky'] as const) {
      const base = point(`${finger}-finger-metacarpal`)
      const tip = point(`${finger}-finger-tip`)
      if (!base || !tip) return false
      const palm = distance(wrist, base)
      if (palm <= 1e-6) return false
      curled &&= distance(wrist, tip) / palm < PALM_GRAB_RELEASE_EXTENSION
    }
    if (curled) return false
  }
  return thumbs.length < 2 || distance(thumbs[0]!, thumbs[1]!) > 0.055
}
