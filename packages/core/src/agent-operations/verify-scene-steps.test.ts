import { expect, test } from 'bun:test'
import { z } from 'zod'
import { WallNode } from '../schema'
import { verifySceneSteps } from './verify-scene'

test('schema validation yields before reading the next 128 scene nodes', () => {
  const nodes = Object.fromEntries(
    Array.from({ length: 260 }, (_, index) => {
      const wall = WallNode.parse({ id: `wall_chunk_${index}`, start: [index, 0], end: [index, 1] })
      return [wall.id, wall]
    }),
  )
  let parsed = 0
  const steps = verifySceneSteps(
    nodes,
    {},
    {
      activeLevelId: null,
      nodeSchema: () => {
        parsed++
        return z.any()
      },
    },
  )
  expect(steps.next().done).toBe(false)
  expect(parsed).toBe(128)
  expect(steps.next().done).toBe(false)
  expect(parsed).toBe(256)
  expect(steps.next().done).toBe(false)
  expect(parsed).toBe(260)
})
