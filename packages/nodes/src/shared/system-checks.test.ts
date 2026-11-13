import { expect, test } from 'bun:test'
import {
  type AnyNode,
  type AnyNodeId,
  LevelNode,
  PipeSegmentNode,
  registerNode,
  WallNode,
} from '@aedifex/core'
import { pipeSegmentDefinition } from '../pipe-segment/definition'
import { checkDistributionSystems } from './system-checks'

registerNode(pipeSegmentDefinition)
const scene = (...nodes: AnyNode[]): Record<AnyNodeId, AnyNode> =>
  Object.fromEntries(nodes.map((node) => [node.id, node]))

test('checks expose open ends, disconnected branches and drainage findings', () => {
  const a = PipeSegmentNode.parse({
    path: [
      [0, 1, 0],
      [3, 1, 0],
    ],
  })
  const b = PipeSegmentNode.parse({
    path: [
      [10, 1, 0],
      [13, 1, 0],
    ],
  })
  const findings = checkDistributionSystems(scene(a, b))
  expect(findings.filter((finding) => finding.code === 'open-end')).toHaveLength(4)
  expect(findings.some((finding) => finding.code === 'disconnected-branch')).toBe(true)
  expect(findings.some((finding) => finding.code === 'slope-too-flat')).toBe(true)
})
test('coincident different systems are visible as incompatible', () => {
  const a = PipeSegmentNode.parse({
    path: [
      [0, 1, 0],
      [3, 1, 0],
    ],
  })
  const b = PipeSegmentNode.parse({
    system: 'vent',
    path: [
      [3, 1, 0],
      [5, 1, 0],
    ],
  })
  expect(
    checkDistributionSystems(scene(a, b)).some((finding) => finding.code === 'connection-mismatch'),
  ).toBe(true)
})
test('cross-floor joints use world elevation', () => {
  const lower = LevelNode.parse({ level: 0, height: 3 })
  const upper = LevelNode.parse({ level: 1, height: 3 })
  const a = PipeSegmentNode.parse({
    parentId: lower.id,
    path: [
      [0, 0, 0],
      [0, 3, 0],
    ],
  })
  const b = PipeSegmentNode.parse({
    parentId: upper.id,
    path: [
      [0, 0, 0],
      [0, 2, 0],
    ],
  })
  const findings = checkDistributionSystems(scene(lower, upper, a, b))
  expect(findings.filter((finding) => finding.code === 'open-end')).toHaveLength(2)
  expect(findings.some((finding) => finding.code === 'disconnected-branch')).toBe(false)
})
test('intersections include affected node ids and ignore separated heights', () => {
  const a = PipeSegmentNode.parse({
    path: [
      [0, 1, 0],
      [3, 1, 0],
    ],
  })
  const b = PipeSegmentNode.parse({
    path: [
      [1, 1, -1],
      [1, 1, 1],
    ],
  })
  const wall = WallNode.parse({ start: [2, -1], end: [2, 1], height: 3 })
  const findings = checkDistributionSystems(scene(a, b, wall))
  expect(
    findings.some(
      (finding) => finding.code === 'possible-intersection' && finding.nodeIds.includes(b.id),
    ),
  ).toBe(true)
  expect(
    findings.some(
      (finding) => finding.code === 'possible-intersection' && finding.nodeIds.includes(wall.id),
    ),
  ).toBe(true)
  const elevated = {
    ...b,
    path: [
      [1, 5, -1],
      [1, 5, 1],
    ] as [number, number, number][],
  }
  expect(
    checkDistributionSystems(scene(a, elevated)).some(
      (finding) => finding.code === 'possible-intersection',
    ),
  ).toBe(false)
})

test('includes the high end of a sloped wall in possible-intersection checks', () => {
  const wall = WallNode.parse({ start: [0, 0], end: [4, 0], height: 1, endHeightOffset: 2 })
  const pipe = PipeSegmentNode.parse({
    path: [
      [3.5, 2.5, -1],
      [3.5, 2.5, 1],
    ],
  })
  expect(
    checkDistributionSystems(scene(wall, pipe)).some(
      (finding) => finding.code === 'possible-intersection' && finding.nodeIds.includes(wall.id),
    ),
  ).toBe(true)
})

test('includes an interior high point of a curved sloped wall in collision checks', () => {
  const level = LevelNode.parse({ height: 3 })
  const wall = WallNode.parse({
    parentId: level.id,
    start: [0, 0],
    end: [4, 0],
    height: 1,
    curveOffset: -1,
    topProfile: { offset: 0, from: 0, to: 1, acrossShift: 4, supportHeight: 1 },
  })
  const pipe = PipeSegmentNode.parse({
    parentId: level.id,
    path: [
      [2, 1.8, 0],
      [2, 1.8, 2],
    ],
  })
  expect(
    checkDistributionSystems(scene(level, wall, pipe)).some(
      (finding) => finding.code === 'possible-intersection' && finding.nodeIds.includes(wall.id),
    ),
  ).toBe(true)
})
