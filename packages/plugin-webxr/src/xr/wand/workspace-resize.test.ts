import { expect, test } from 'bun:test'
import { Euler, Group, Matrix4, Quaternion, Vector3 } from 'three'
import { WorkspaceResize } from './workspace-resize'

test('all four corners grow outward and shrink inward without changing aspect ratio', () => {
  for (const x of [-1, 1]) for (const y of [-1, 1]) {
    const resize = new WorkspaceResize()
    const corner = new Vector3(x * 0.76, y * 0.58, 0)
    expect(resize.start(1, corner, new Matrix4(), 1)).toBe(true)
    expect(resize.move(1, corner.clone().multiplyScalar(1.25))).toBeCloseTo(1.25)
    expect(resize.move(1, corner.clone().multiplyScalar(0.8))).toBeCloseTo(0.8)
    expect(resize.move(1, corner.clone().setZ(0.5))).toBeCloseTo(1)
  }
})

test('rotated panels resize in their original plane with no scale feedback or center drift', () => {
  const panel = new Group()
  panel.position.set(4, 1.4, -3)
  panel.quaternion.setFromEuler(new Euler(-0.3, 0.7, 0))
  panel.updateWorldMatrix(true, false)
  const content = new Group()
  panel.add(content)
  const resize = new WorkspaceResize()
  const start = new Vector3(0.5, 0.4, 0)
  const world = start.clone().applyMatrix4(panel.matrixWorld)
  const originalPosition = panel.position.clone()
  expect(resize.start(1, world, panel.matrixWorld, 1.2)).toBe(true)
  const moved = start.clone().multiplyScalar(1.1).applyMatrix4(panel.matrixWorld)
  const scale = resize.move(1, moved)!
  content.scale.setScalar(scale)
  panel.updateWorldMatrix(true, true)
  expect(scale).toBeCloseTo(1.32)
  expect(resize.move(1, moved)).toBeCloseTo(1.32)
  expect(content.scale.toArray()).toEqual([scale, scale, scale])
  expect(panel.position.toArray()).toEqual(originalPosition.toArray())
})

test('clamps extreme drags and does not grow again after crossing the center', () => {
  const resize = new WorkspaceResize()
  resize.start(1, new Vector3(1, 1, 0), new Matrix4(), 1)
  expect(resize.move(1, new Vector3(20, 20, 0))).toBe(1.6)
  expect(resize.move(1, new Vector3(0.1, 0.1, 0))).toBe(0.65)
  expect(resize.move(1, new Vector3(-20, -20, 0))).toBe(0.65)
})

test('one pointer owns resizing until release or cancellation', () => {
  const resize = new WorkspaceResize()
  const point = new Vector3(1, 1, 0)
  resize.start(1, point, new Matrix4(), 1)
  expect(resize.start(2, point, new Matrix4(), 1)).toBe(false)
  expect(resize.move(2, point)).toBeUndefined()
  expect(resize.end(2)).toBe(false)
  expect(resize.pointerId).toBe(1)
  expect(resize.end(1)).toBe(true)
  expect(resize.move(1, point)).toBeUndefined()
  expect(resize.start(2, point, new Matrix4(), 1.3)).toBe(true)
  expect(resize.move(2, point)).toBeCloseTo(1.3)
})

test('invalid tracking and singular transforms cannot start or poison a resize', () => {
  const resize = new WorkspaceResize()
  const point = new Vector3(1, 1, 0)
  expect(resize.start(1, new Vector3(), new Matrix4(), 1)).toBe(false)
  expect(resize.start(1, point, new Matrix4().compose(new Vector3(), new Quaternion(), new Vector3()), 1)).toBe(false)
  expect(resize.start(1, point, new Matrix4(), NaN)).toBe(false)
  expect(resize.pointerId).toBeNull()
  expect(resize.start(1, point, new Matrix4(), 1)).toBe(true)
  expect(resize.move(1, new Vector3(NaN, 0, 0))).toBeUndefined()
  expect(resize.move(1, point)).toBeCloseTo(1)
})
