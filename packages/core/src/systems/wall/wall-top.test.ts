import { describe, expect, test } from 'bun:test'
import {
  BuildingNode,
  computeWallSlabSupport,
  LevelNode,
  resolveWallEffectiveHeight,
  resolveWallTop,
  SlabNode,
  WallNode,
} from '../../index'
import { getWallTop, wallTopStationProfile } from '../../services/storey'
import { getWallChordFractionAt } from './wall-curve'

describe('resolveWallTop', () => {
  test('station profile agrees with the exact wall-top query along curved slopes', () => {
    const level = LevelNode.parse({ id: 'level_profile', height: 3 })
    for (const curveOffset of [-1, 1])
      for (const supportHeight of [undefined, 2]) {
        const wall = WallNode.parse({
          parentId: level.id,
          start: [0, 0],
          end: [4, 0],
          curveOffset,
          topProfile: {
            offset: -4,
            from: 0.2,
            to: 0.8,
            across: 0.3,
            endShift: -0.7,
            acrossShift: 0.4,
            supportHeight,
          },
        })
        const nodes = { [level.id]: level, [wall.id]: wall }
        const profile = wallTopStationProfile({ wall, levelId: level.id, nodes, electedBase: 0.3 })
        for (let i = 0; i <= 20; i++) {
          const station = (profile.length * i) / 20
          expect(profile.topAt(station)).toBeCloseTo(
            getWallTop(wall, level.id, nodes, 0.3, getWallChordFractionAt(wall, station)),
            6,
          )
        }
      }
  })
  test('samples a sloped top along its chord while preserving the authored-height argument', () => {
    const wall = { height: 3.6, endHeightOffset: -1 }
    expect(resolveWallTop(wall, 3.4, 0.05, 3.6, 0)).toBeCloseTo(3.4)
    expect(resolveWallTop(wall, 3.4, 0.05, 3.6, 0.5)).toBeCloseTo(2.9)
    expect(resolveWallTop(wall, 3.4, 0.05, 3.6, 1)).toBeCloseTo(2.4)
    expect(resolveWallTop(wall, 3.4, 0.05, 3.6)).toBeCloseTo(3.4)
  })

  test('a falling end retains a nonzero wall body', () => {
    expect(resolveWallTop({ height: 2, endHeightOffset: -5 }, 3, 0, 3, 1)).toBeCloseTo(0.01)
  })

  test('explicit height on zero base keeps the stored top', () => {
    expect(resolveWallTop({ height: 2.5 }, 3, 0)).toBe(2.5)
  })

  test('explicit height on raised base rides the base', () => {
    expect(resolveWallTop({ height: 2.5 }, 3, 0.6)).toBeCloseTo(3.1)
  })

  test('explicit height on sunken support follows its actual support', () => {
    expect(resolveWallTop({ height: 2.5 }, 3, -0.4)).toBe(2.1)
  })

  test('ground-hosted explicit height remains body-relative in a terrain depression', () => {
    expect(resolveWallTop({ height: 2.5, supportSlabId: 'ground' }, 3, -0.4)).toBeCloseTo(2.1)
    expect(
      resolveWallEffectiveHeight({ height: 2.5, supportSlabId: 'ground' }, 3, -0.4),
    ).toBeCloseTo(2.5)
  })

  test('plane-bound wall tops out at the storey plane regardless of base', () => {
    expect(resolveWallTop({}, 3, 0)).toBe(3)
    expect(resolveWallTop({}, 3, 0.6)).toBe(3)
    expect(resolveWallTop({}, 3, -0.4)).toBe(3)
  })

  test('an authored storey-height wall ends at the covering underside, not its support plus height', () => {
    expect(resolveWallTop({ height: 3.6 }, 3.6, 0.05)).toBeCloseTo(3.6)
    expect(resolveWallEffectiveHeight({ height: 3.6 }, 3.6, 0.05)).toBeCloseTo(3.55)
    expect(resolveWallTop({ height: 3.6 }, 3.4, 0.05, 3.6)).toBeCloseTo(3.4)
    expect(resolveWallTop({ height: 3.6 }, 4.1, 0.55, 3.6)).toBeCloseTo(4.1)
    expect(resolveWallTop({ height: 4.2 }, 3.6, 0.05, 3.6)).toBeCloseTo(4.25)
    expect(resolveWallTop({ height: 3.6 }, 3.6, 0.05, null)).toBeCloseTo(3.65)
    expect(resolveWallTop({ height: 3.6, supportSlabId: 'ground' }, 3.4, 0.2, 3.6)).toBeCloseTo(3.8)
  })
})

describe('resolveWallEffectiveHeight', () => {
  test('explicit on raised base extrudes the stored height', () => {
    expect(resolveWallEffectiveHeight({ height: 2.5 }, 3, 0.6)).toBeCloseTo(2.5)
  })

  test('explicit on zero base extrudes the stored height', () => {
    expect(resolveWallEffectiveHeight({ height: 2.5 }, 3, 0)).toBe(2.5)
  })

  test('plane-bound on raised base gets shorter, never taller', () => {
    expect(resolveWallEffectiveHeight({}, 3, 0.6)).toBeCloseTo(2.4)
    expect(resolveWallEffectiveHeight({}, 3, 0.6)).toBeLessThan(3)
  })

  test('plane-bound on zero base spans the full storey', () => {
    expect(resolveWallEffectiveHeight({}, 3, 0)).toBe(3)
  })

  test('plane-bound on sunken base fills down while the top stays at the plane', () => {
    expect(resolveWallEffectiveHeight({}, 3, -0.4)).toBeCloseTo(3.4)
  })

  test('saved storey-height walls meet the upper slab underside without changing authored data', () => {
    const polygon: [number, number][] = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ]
    const building = BuildingNode.parse({
      id: 'building_datum',
      children: ['level_ground', 'level_upper'],
    })
    const ground = LevelNode.parse({
      id: 'level_ground',
      parentId: building.id,
      level: 0,
      height: 3.6,
      children: ['slab_ground', 'wall_datum'],
    })
    const upper = LevelNode.parse({
      id: 'level_upper',
      parentId: building.id,
      level: 1,
      height: 3.3,
      children: ['slab_upper'],
    })
    const floor = SlabNode.parse({
      id: 'slab_ground',
      parentId: ground.id,
      polygon,
      elevation: 0.05,
      thickness: 0.05,
    })
    const cover = SlabNode.parse({
      id: 'slab_upper',
      parentId: upper.id,
      polygon,
      elevation: 0.05,
      thickness: 0.05,
    })
    const wall = WallNode.parse({
      id: 'wall_datum',
      parentId: ground.id,
      start: [0, 0],
      end: [4, 0],
      height: 3.6,
    })
    const nodes = Object.fromEntries(
      [building, ground, upper, floor, cover, wall].map((node) => [node.id, node]),
    )
    const base = computeWallSlabSupport(
      wall,
      [floor],
      [wall],
      undefined,
      undefined,
      0,
      nodes,
    ).elevation
    expect(base).toBeCloseTo(0.05)
    expect(getWallTop(wall, ground.id, nodes, base)).toBeCloseTo(
      ground.height! + cover.elevation - cover.thickness,
    )
    const thicker = { ...nodes, [cover.id]: { ...cover, thickness: 0.25 } }
    expect(getWallTop(wall, ground.id, thicker, base)).toBeCloseTo(3.4)
    const taller = { ...wall, height: 4.2 }
    expect(getWallTop(taller, ground.id, { ...nodes, [wall.id]: taller }, base)).toBeCloseTo(4.25)
    const sloped = { ...wall, endHeightOffset: -1 }
    expect(getWallTop(sloped, ground.id, nodes, base, 1)).toBeCloseTo(2.6)
    expect(getWallTop(sloped, ground.id, nodes, base)).toBeCloseTo(3.6)
    expect(wall.height).toBe(3.6)
  })
})
