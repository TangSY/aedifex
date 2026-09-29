import { describe, expect, test } from 'bun:test'
import { Object3D, PerspectiveCamera, Vector3 } from 'three'
import { GOD_ORIGIN_POSITION, GOD_ORIGIN_ROTATION } from './god-mode-constants'

describe('God-mode XR tracking alignment', () => {
  test('keeps the horizon level when the headset turns sideways', () => {
    const origin = new Object3D()
    const headset = new PerspectiveCamera()
    origin.position.copy(GOD_ORIGIN_POSITION)
    origin.rotation.copy(GOD_ORIGIN_ROTATION)
    headset.position.set(0, 1.6, 0)
    origin.add(headset)

    for (const yaw of [0, Math.PI / 4, Math.PI / 2, Math.PI]) {
      headset.rotation.set(0, yaw, 0)
      origin.updateWorldMatrix(true, true)
      expect(headset.getWorldDirection(new Vector3()).y).toBeCloseTo(0)
      const up = new Vector3(0, 1, 0).transformDirection(headset.matrixWorld)
      expect(up.distanceTo(new Vector3(0, 1, 0))).toBeLessThan(1e-6)
    }
  })

  test('room-scale forward movement stays at the same world height', () => {
    const origin = new Object3D()
    origin.position.copy(GOD_ORIGIN_POSITION)
    origin.rotation.copy(GOD_ORIGIN_ROTATION)
    origin.updateWorldMatrix(true, false)
    const start = origin.localToWorld(new Vector3(0, 1.6, 0))
    const end = origin.localToWorld(new Vector3(0, 1.6, -2))
    expect(end.y).toBeCloseTo(start.y)
    expect(start.y).toBeGreaterThan(4.5)
  })
})
