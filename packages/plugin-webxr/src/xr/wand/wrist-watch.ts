import { Matrix4, Quaternion, Vector3 } from 'three'
import {
  type XRPlayerMode,
  XR_PLAYER_MODES,
} from '../mode-switching/store/player-mode'

export function wristModeAction(mode: XRPlayerMode) {
  return mode === XR_PLAYER_MODES.GOD
    ? {
        label: 'Enter\nWalkthrough',
        status: 'GOD MODE',
        target: XR_PLAYER_MODES.HUMAN,
      }
    : {
        label: 'Return to\nGod Mode',
        status: 'WALKTHROUGH',
        target: XR_PLAYER_MODES.GOD,
      }
}

/** Joint positions must all be expressed in the XR origin's coordinate frame. */
export function createWristWatchPose() {
  const towardFingers = new Vector3()
  const index = new Vector3()
  const pinky = new Vector3()
  const normal = new Vector3()
  const across = new Vector3()
  const basis = new Matrix4()
  const toEye = new Vector3()
  const position = new Vector3()
  const rotation = new Quaternion()
  return {
    position,
    rotation,
    update(
      wrist: Vector3,
      indexKnuckle: Vector3,
      pinkyKnuckle: Vector3,
      eye: Vector3,
    ) {
      if (
        ![wrist, indexKnuckle, pinkyKnuckle, eye].every((v) =>
          v.toArray().every(Number.isFinite),
        )
      )
        return null
      index.copy(indexKnuckle).sub(wrist)
      pinky.copy(pinkyKnuckle).sub(wrist)
      // Left-hand palm normal: opposite index × pinky. Do not assume runtime wrist axes.
      normal.crossVectors(pinky, index)
      towardFingers.addVectors(index, pinky)
      if (normal.lengthSq() < 1e-10 || towardFingers.lengthSq() < 1e-10)
        return null
      normal.normalize()
      towardFingers.normalize()
      across.crossVectors(towardFingers, normal).normalize()
      towardFingers.crossVectors(normal, across).normalize()
      rotation.setFromRotationMatrix(
        basis.makeBasis(across, towardFingers, normal),
      )
      // Sit behind the wrist joint, on the forearm where a watch is worn.
      position.copy(wrist).addScaledVector(towardFingers, -0.045)
      toEye.copy(eye).sub(position)
      const distance = toEye.length()
      return {
        distance,
        facing: distance > 0 ? normal.dot(toEye.divideScalar(distance)) : -1,
      }
    },
  }
}

/** Left controller approximation: +X faces the palm; the cuff extends along +Z
 * behind the handle. +Y is above the Quest grip, not along its handle toward the wrist.
 * Controllers have no wrist joint; keep this offset local to the grip, not the aim ray.
 */
export function createControllerWatchPose() {
  const position = new Vector3()
  const rotation = new Quaternion()
  const gripRotation = new Quaternion()
  const normal = new Vector3()
  const toEye = new Vector3()
  const wristBasis = new Quaternion().setFromRotationMatrix(
    new Matrix4().makeBasis(
      new Vector3(0, -1, 0),
      new Vector3(0, 0, -1),
      new Vector3(1, 0, 0),
    ),
  )
  return {
    position,
    rotation,
    update(
      grip: {
        position: { x: number; y: number; z: number }
        orientation: { x: number; y: number; z: number; w: number }
      },
      eye: Vector3,
    ) {
      gripRotation.copy(grip.orientation)
      if (
        ![
          grip.position.x,
          grip.position.y,
          grip.position.z,
          ...gripRotation.toArray(),
          ...eye.toArray(),
        ].every(Number.isFinite) ||
        gripRotation.lengthSq() < 1e-10
      )
        return null
      gripRotation.normalize()
      position.set(0, 0, 0.09).applyQuaternion(gripRotation).add(grip.position)
      rotation.copy(gripRotation).multiply(wristBasis)
      normal.set(1, 0, 0).applyQuaternion(gripRotation)
      toEye.copy(eye).sub(position)
      const distance = toEye.length()
      return {
        distance,
        facing: distance > 0 ? normal.dot(toEye.divideScalar(distance)) : -1,
      }
    },
  }
}

export function watchFaceVisible(
  wasVisible: boolean,
  pose: { distance: number; facing: number } | null,
) {
  return (
    !!pose &&
    pose.distance >= 0.15 &&
    pose.distance <= 0.85 &&
    pose.facing >= (wasVisible ? 0.35 : 0.6)
  )
}

/** The wearing hand must not activate its own watch while gesturing. */
export function watchPointerAllowed(_id: number, type: string, state: unknown) {
  if (
    type === 'grab' ||
    !state ||
    typeof state !== 'object' ||
    !('inputSource' in state)
  )
    return false
  const source = state.inputSource as { handedness?: string } | undefined
  return source?.handedness === 'right'
}
