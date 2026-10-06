import { describe, expect, test } from 'bun:test'
import { WallNode } from '@aedifex/core/schema'
import { wallLocalToWorld as doorWallLocalToWorld } from '../door/door-math'
import { wallLocalToWorld as windowWallLocalToWorld } from '../window/window-math'
import { wallToWorld } from './opening-guides-runtime'

describe('wall-local opening frame', () => {
  test('includes the wall support offset in door and window world Y', () => {
    const wall = WallNode.parse({
      start: [2, 3],
      end: [6, 3],
      supportOffset: 1.75,
    })

    expect(doorWallLocalToWorld(wall, 1, 1, 0.5, 0.25)).toEqual([3, 3.5, 3])
    expect(windowWallLocalToWorld(wall, 1, 1, 0.5, 0.25)).toEqual([3, 3.5, 3])
    expect(wallToWorld(wall)(1, 1)).toEqual([3, 2.75, 3])
  })

  test('keeps opening plane offsets on either justified face without losing the support height', () => {
    for (const [justification, expectedZ] of [['a', 3.5], ['b', 3.1]] as const) {
      const wall = WallNode.parse({
        start: [2, 3],
        end: [6, 3],
        thickness: 0.4,
        justification,
        supportOffset: 1.75,
      })
      for (const project of [doorWallLocalToWorld, windowWallLocalToWorld]) {
        const [x, y, z] = project(wall, 1, 1, 0.5, 0.25, 0.3)
        expect(x).toBeCloseTo(3)
        expect(y).toBeCloseTo(3.5)
        expect(z).toBeCloseTo(expectedZ)
      }
    }
  })
})
