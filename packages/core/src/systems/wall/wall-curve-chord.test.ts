import { expect, test } from 'bun:test'
import { WallNode } from '../../schema'
import { getWallChordFractionAt, getWallCurveLength, getWallStationAtChordFraction } from './wall-curve'

test('curved wall stations and chord fractions round-trip on either side of the arc', () => {
  for (const curveOffset of [-1.6, 0, 1.6]) {
    const wall = WallNode.parse({ start: [1, 2], end: [5, 2], curveOffset })
    const length = getWallCurveLength(wall)
    for (const fraction of [0, 0.1, 0.25, 0.5, 0.9, 1]) {
      const station = getWallStationAtChordFraction(wall, fraction)
      expect(station).toBeGreaterThanOrEqual(0)
      expect(station).toBeLessThanOrEqual(length)
      expect(getWallChordFractionAt(wall, station)).toBeCloseTo(fraction, 5)
    }
  }
})
