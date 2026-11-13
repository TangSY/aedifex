import { expect, test } from 'bun:test'
import { getWallCurveFrameAt, WallNode } from '@aedifex/core'
import { roomPushHandles, wallPushHandles } from './room-handle-drag'

test('wall push arrows follow the sloped top at the middle of their span', () => {
  for (const curveOffset of [0, 1]) {
    const wall = WallNode.parse({
      start: [0, 0],
      end: [4, 0],
      height: 3,
      endHeightOffset: -2,
      curveOffset,
    })
    const nodes = { [wall.id]: wall }
    expect(wallPushHandles(wall, nodes)[0]!.height).toBeCloseTo(1.92)
    const t = 0.25
    const frame = getWallCurveFrameAt(wall, t)
    const expectedHeight = 3 - 2 * (frame.point.x / 4) - 0.08
    const [handle] = roomPushHandles(nodes, [
      { boundaryId: wall.id, kind: 'wall', face: 'a', t0: 0, t1: 0.5 },
    ])
    expect(handle!.height).toBeCloseTo(expectedHeight)
  }
})
