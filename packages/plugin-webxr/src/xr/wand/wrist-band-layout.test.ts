import { describe, expect, test } from 'bun:test'
import { Euler, Vector3 } from 'three'
import {
  WRIST_BAND,
  WRIST_BAND_EDGES,
  WRIST_BAND_TILES,
} from './wrist-band-layout'

describe('compact wrist band', () => {
  test('three tiles sit tangent to the palm-side band, not a separate face', () => {
    expect(WRIST_BAND_TILES).toHaveLength(3)
    for (const tile of WRIST_BAND_TILES) {
      const [x, y, z] = tile.position
      expect(
        (x / WRIST_BAND.radiusX) ** 2 + (z / WRIST_BAND.radiusZ) ** 2,
      ).toBeCloseTo(1)
      expect(y).toBe(0)
      expect(z).toBeGreaterThan(0)
      const normal = new Vector3(
        x / WRIST_BAND.radiusX ** 2,
        0,
        z / WRIST_BAND.radiusZ ** 2,
      ).normalize()
      const facing = new Vector3(0, 0, 1).applyEuler(
        new Euler(...tile.rotation),
      )
      expect(facing.dot(normal)).toBeCloseTo(1)
    }
  })

  test('cuff is compact with inset tiles and tight corners', () => {
    expect(WRIST_BAND.width).toBeLessThan(0.04)
    expect(WRIST_BAND.radiusX * 2).toBeLessThan(0.08)
    expect(WRIST_BAND.buttonHeight).toBeLessThan(WRIST_BAND.width)
    expect(WRIST_BAND.cornerRadius).toBeLessThan(WRIST_BAND.buttonWidth / 10)
    // Adjacent faces stay separated even with the shared button's 4 mm surface lift.
    const centers = WRIST_BAND_TILES.map((tile) =>
      new Vector3(0, 0, 0.004)
        .applyEuler(new Euler(...tile.rotation))
        .add(new Vector3(...tile.position)),
    )
    expect(centers[0]!.distanceTo(centers[1]!)).toBeGreaterThan(
      WRIST_BAND.buttonWidth,
    )
    expect(centers[1]!.distanceTo(centers[2]!)).toBeGreaterThan(
      WRIST_BAND.buttonWidth,
    )
  })

  test('both outlines close around the entire cuff', () => {
    expect(WRIST_BAND_EDGES).toHaveLength(2)
    for (const edge of WRIST_BAND_EDGES) {
      expect(
        new Vector3(...edge[0]!).distanceTo(new Vector3(...edge.at(-1)!)),
      ).toBeLessThan(1e-10)
      for (const point of edge)
        expect(Math.abs(point[1])).toBe(WRIST_BAND.width / 2)
    }
  })
})
