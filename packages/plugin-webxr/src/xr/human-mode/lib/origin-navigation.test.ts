import { expect, test } from 'bun:test'
import { Object3D, Vector3 } from 'three'
import { translateOrigin } from './origin-navigation'

test('horizontal locomotion preserves a validated basement elevation', () => {
  const origin = new Object3D()
  origin.position.y = -3
  translateOrigin(origin, new Vector3(1, 0, 0))
  expect(origin.position.toArray()).toEqual([1, -3, 0])
})
