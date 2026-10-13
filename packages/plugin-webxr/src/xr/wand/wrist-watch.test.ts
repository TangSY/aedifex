import { describe, expect, test } from 'bun:test'
import { Matrix4, Quaternion, Vector3 } from 'three'
import { metaQuestTouchPlus } from 'iwer'
import {
  createWristWatchPose,
  createControllerWatchPose,
  watchFaceVisible,
  watchPointerAllowed,
  wristModeAction,
} from './wrist-watch'

describe('inner-wrist watch', () => {
  test('Quest 3 neutral controller places cuff behind and below grip, along the handle', () => {
    // Real emulator profile: aim-space +Y is up; +Z is back toward the wearer.
    const gripMatrix = new Matrix4().fromArray(
      metaQuestTouchPlus.layout.left!.gripOffsetMatrix!,
    )
    const position = new Vector3()
    const orientation = new Quaternion()
    gripMatrix.decompose(position, orientation, new Vector3())
    const pose = createControllerWatchPose()
    pose.update({ position, orientation }, new Vector3(0, 0, 0.4))
    const offset = pose.position.clone().sub(position)
    expect(offset.y).toBeLessThan(-0.04)
    expect(offset.z).toBeGreaterThan(0.04)
    const forearmAxis = new Vector3(0, -1, 0).applyQuaternion(pose.rotation)
    expect(forearmAxis.dot(offset.clone().normalize())).toBeCloseTo(1)
  })
  test('controller ring sits behind the grip with its face on the left palm side', () => {
    const pose = createControllerWatchPose()
    const view = pose.update(
      { position: new Vector3(), orientation: new Quaternion() },
      new Vector3(0.4, 0, 0.09),
    )
    expect(pose.position.z).toBeCloseTo(0.09)
    expect(new Vector3(0, 0, 1).applyQuaternion(pose.rotation).x).toBeCloseTo(1)
    expect(new Vector3(0, 1, 0).applyQuaternion(pose.rotation).z).toBeCloseTo(
      -1,
    )
    expect(watchFaceVisible(false, view)).toBe(true)
  })

  test('controller wrist offset rotates with the grip and hides when facing away', () => {
    const pose = createControllerWatchPose()
    const orientation = new Quaternion().setFromAxisAngle(
      new Vector3(0, 1, 0),
      Math.PI,
    )
    const view = pose.update(
      { position: new Vector3(0, 1, 0), orientation },
      new Vector3(0.4, 1, -0.09),
    )
    expect(pose.position.y).toBeCloseTo(1)
    expect(pose.position.z).toBeCloseTo(-0.09)
    expect(new Vector3(0, 0, 1).applyQuaternion(pose.rotation).x).toBeCloseTo(
      -1,
    )
    expect(watchFaceVisible(true, view)).toBe(false)
    expect(
      pose.update(
        { position: new Vector3(NaN, 0, 0), orientation },
        new Vector3(),
      ),
    ).toBeNull()
  })

  test('offers an explicit destination in both modes', () => {
    expect(wristModeAction('god').target).toBe('human')
    expect(wristModeAction('god').label).toContain('Walkthrough')
    expect(wristModeAction('human').target).toBe('god')
    expect(wristModeAction('human').label).toContain('God Mode')
  })

  test('sits behind the wrist with its screen on the left palm side', () => {
    const pose = createWristWatchPose()
    const result = pose.update(
      new Vector3(),
      new Vector3(-0.02, 0, -0.06),
      new Vector3(0.02, 0, -0.06),
      new Vector3(0, 0.4, 0.045),
    )
    expect(pose.position.z).toBeCloseTo(0.045)
    const screenNormal = new Vector3(0, 0, 1).applyQuaternion(pose.rotation)
    expect(screenNormal.y).toBeCloseTo(1)
    expect(result?.facing).toBeCloseTo(1)
    expect(watchFaceVisible(false, result)).toBe(true)
  })

  test('rotates with the hand rather than billboarding to the camera', () => {
    const pose = createWristWatchPose()
    const result = pose.update(
      new Vector3(),
      new Vector3(-0.02, 0, 0.06),
      new Vector3(0.02, 0, 0.06),
      new Vector3(0, 0.4, 0),
    )
    expect(new Vector3(0, 0, 1).applyQuaternion(pose.rotation).y).toBeCloseTo(
      -1,
    )
    expect(watchFaceVisible(false, result)).toBe(false)
  })

  test('hysteresis prevents flicker; lost tracking and out-of-reach faces hide', () => {
    expect(watchFaceVisible(false, { distance: 0.4, facing: 0.5 })).toBe(false)
    expect(watchFaceVisible(true, { distance: 0.4, facing: 0.5 })).toBe(true)
    expect(watchFaceVisible(true, { distance: 0.4, facing: 0.2 })).toBe(false)
    expect(watchFaceVisible(true, { distance: 1.2, facing: 1 })).toBe(false)
    expect(watchFaceVisible(true, null)).toBe(false)
    const pose = createWristWatchPose()
    expect(
      pose.update(new Vector3(), new Vector3(), new Vector3(), new Vector3()),
    ).toBeNull()
  })

  test('only the opposite input can select; grip gestures do not activate the watch', () => {
    expect(
      watchPointerAllowed(1, 'ray', { inputSource: { handedness: 'right' } }),
    ).toBe(true)
    expect(
      watchPointerAllowed(1, 'ray', { inputSource: { handedness: 'left' } }),
    ).toBe(false)
    expect(
      watchPointerAllowed(1, 'grab', { inputSource: { handedness: 'right' } }),
    ).toBe(false)
    expect(watchPointerAllowed(1, 'ray', undefined)).toBe(false)
  })
})
