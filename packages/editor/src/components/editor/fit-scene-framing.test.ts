import { expect, test } from 'bun:test'
import { createAutoFrameQueue, sceneFitPose } from './fit-scene-framing'

const bounds = { min: [0, 0], max: [20, 10], center: [10, 5], size: [20, 10] } as {
  min: [number, number]
  max: [number, number]
  center: [number, number]
  size: [number, number]
}

test('automatic framing waits for controls and is consumed once', () => {
  const queue = createAutoFrameQueue()
  queue.request(bounds)
  expect(queue.take({ ready: false, superseded: false })).toBeNull()
  expect(queue.take({ ready: true, superseded: false })).toEqual({ bounds })
  expect(queue.take({ ready: true, superseded: false })).toBeNull()
})

test('a manual pose or active follow cancels pending automatic framing', () => {
  const queue = createAutoFrameQueue()
  queue.request(bounds)
  expect(queue.take({ ready: false, superseded: true })).toBeNull()
  expect(queue.take({ ready: true, superseded: false })).toBeNull()
  queue.request(null)
  queue.cancel()
  expect(queue.take({ ready: true, superseded: false })).toBeNull()
})

test('frame pose centers the footprint and sizes orthographic zoom', () => {
  const pose = sceneFitPose({ bounds, groundY: 3 })
  expect(pose.target).toEqual([10, 3, 5])
  expect(pose.eye[1]).toBeGreaterThan(3)
  expect(pose.radius).toBeGreaterThan(Math.hypot(10, 5))
  expect(sceneFitPose({ bounds: null, groundY: 3 }).target).toEqual([0, 3, 0])
})
