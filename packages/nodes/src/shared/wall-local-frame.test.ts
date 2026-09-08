import { describe, expect, test } from 'bun:test'
import { WallNode } from '@aedifex/core/schema'
import { wallLocalToWorld as doorWallLocalToWorld } from '../door/door-math'
import { wallLocalToWorld as windowWallLocalToWorld } from '../window/window-math'

describe('wall-local opening frame', () => {
  test('includes the wall support offset in door and window world Y', () => {
    const wall = WallNode.parse({
      start: [2, 3],
      end: [6, 3],
      supportOffset: 1.75,
    })

    expect(doorWallLocalToWorld(wall, 1, 1, 0.5, 0.25)).toEqual([3, 3.5, 3])
    expect(windowWallLocalToWorld(wall, 1, 1, 0.5, 0.25)).toEqual([3, 3.5, 3])
  })
})
