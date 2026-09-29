import { test } from 'bun:test'
import assert from 'node:assert/strict'
import { Group, Vector3 } from 'three'
import { clampWorkspaceDragHeight } from './workspace-placement'

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8)

test('limits vertical dragging relative to seated and standing viewers', () => {
  const panel = new Group()
  for (const height of [1, 1.7]) {
    const eye = new Vector3(0, height, 0)
    const low = clampWorkspaceDragHeight(panel, new Vector3(2, -100, -3), eye)
    close(low.y, height - 0.7)
    assert.equal(low.x, 2)
    assert.equal(low.z, -3)
    close(clampWorkspaceDragHeight(panel, new Vector3(0, 100, -1), eye).y, height + 0.35)
  }
})

test('preserves positions within the allowed range', () => {
  const position = new Vector3(3, 1.4, -0.4)
  assert.deepEqual(clampWorkspaceDragHeight(new Group(), position.clone(), new Vector3(0, 1.6, 0)), position)
})

test('clamps in metres even with a translated, rotated and scaled parent', () => {
  const parent = new Group()
  parent.position.set(4, 3, -2)
  parent.rotation.set(0.4, 1.1, 0.2)
  parent.scale.set(2, 3, 0.5)
  const panel = new Group()
  parent.add(panel)
  parent.updateWorldMatrix(true, true)
  const target = parent.worldToLocal(new Vector3(5, -20, -4))
  clampWorkspaceDragHeight(panel, target, new Vector3(0, 1.6, 0))
  parent.localToWorld(target)
  close(target.x, 5)
  close(target.y, 0.9)
  close(target.z, -4)
})
