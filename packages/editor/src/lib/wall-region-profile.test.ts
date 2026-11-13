import { expect, test } from 'bun:test'
import { wallRegionProfile } from './wall-region-profile'

test('clips an unbounded region to a sloping wall top', () => {
  const pieces = wallRegionProfile({ length: 4, startTop: 1, endTop: 3, runs: null, region: {} })
  expect(pieces).toEqual([{ u0: 0, u1: 4, bottom: 0, top0: 1, top1: 3 }])
})

test('splits the upper edge exactly where a bounded region meets the slope', () => {
  const pieces = wallRegionProfile({
    length: 4,
    startTop: 1,
    endTop: 3,
    runs: null,
    region: { v1: 2 },
  })
  expect(pieces).toEqual([
    { u0: 0, u1: 2, bottom: 0, top0: 1, top1: 2 },
    { u0: 2, u1: 4, bottom: 0, top0: 2, top1: 2 },
  ])
})

test('clips away empty portions and respects independent stepped face bases', () => {
  const pieces = wallRegionProfile({
    length: 4,
    startTop: 3,
    endTop: 1,
    runs: [
      { start: 0, end: 2, y: 0 },
      { start: 2, end: 4, y: 0.5 },
    ],
    region: { v0: 1, v1: 2 },
  })
  expect(pieces).toEqual([
    { u0: 0, u1: 2, bottom: 1, top0: 2, top1: 2 },
    { u0: 2, u1: 3, bottom: 1.5, top0: 2, top1: 1.5 },
  ])
})

test('keeps separate visible islands when a raised face base hides the region', () => {
  const pieces = wallRegionProfile({
    length: 4,
    startTop: 2,
    endTop: 2,
    runs: [
      { start: 0, end: 1, y: 0 },
      { start: 1, end: 3, y: 2 },
      { start: 3, end: 4, y: 0 },
    ],
    region: {},
  })
  expect(pieces).toEqual([
    { u0: 0, u1: 1, bottom: 0, top0: 2, top1: 2 },
    { u0: 3, u1: 4, bottom: 0, top0: 2, top1: 2 },
  ])
})

test('a mitred end uses the same minimum top as the rendered wall', () => {
  const pieces = wallRegionProfile({
    length: 4,
    minU: -3,
    maxU: 4,
    startTop: 1,
    endTop: 3,
    runs: null,
    region: {},
  })
  expect(pieces[0]?.u0).toBe(-3)
  expect(pieces[0]?.top0).toBeCloseTo(0.01)
  expect(pieces[0]?.top1).toBeCloseTo(0.01)
  expect(pieces.at(-1)?.top1).toBeCloseTo(3)
})
