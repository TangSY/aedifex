import { expect, test } from 'bun:test'
import { WallNode } from './wall'

test('legacy walls stay flat without storing a slope, and authored offsets must be finite', () => {
  const wall = { start: [0, 0], end: [4, 0] }
  expect(WallNode.parse(wall).endHeightOffset).toBeUndefined()
  expect(WallNode.parse({ ...wall, endHeightOffset: -1.2 }).endHeightOffset).toBe(-1.2)
  expect(WallNode.safeParse({ ...wall, endHeightOffset: Number.POSITIVE_INFINITY }).success).toBe(
    false,
  )
})
