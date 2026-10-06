import { describe, expect, test } from 'bun:test'
import { Euler, Vector3 } from 'three'
import { getPage, getPageWithPinnedFirst, resolveWandPanelFacePose } from './panel-layout'

describe('XR wand panel layout', () => {
  test('keeps Select available on every paginated palette page', () => {
    expect(
      getPageWithPinnedFirst(['select', ...Array.from({ length: 17 }, (_, i) => i)], 1, 9),
    ).toEqual({
      currentPage: 1,
      items: ['select', 8, 9, 10, 11, 12, 13, 14, 15],
      pageCount: 3,
    })
  })

  test('mirrors the ring faces for the opposite hand', () => {
    const left = resolveWandPanelFacePose(1, 'left')
    const right = resolveWandPanelFacePose(1, 'right')

    expect(right.position[0]).toBeCloseTo(-left.position[0])
    expect(right.position[1]).toBeCloseTo(left.position[1])
    expect(right.rotation[1]).toBeCloseTo(-left.rotation[1])
  })

  test('matches the reference three-face ring at 120 degrees', () => {
    const normals = [0, 1, 2].map((index) => {
      const pose = resolveWandPanelFacePose(index, 'left')
      expect(pose.position[2]).toBeCloseTo(0)
      const normal = new Vector3(0, 0, 1).applyEuler(new Euler(...pose.rotation))
      expect(normal.z).toBeCloseTo(0)
      return normal
    })

    expect(normals[0]!.dot(normals[1]!)).toBeCloseTo(-0.5)
    expect(normals[1]!.dot(normals[2]!)).toBeCloseTo(-0.5)
    expect(normals[2]!.dot(normals[0]!)).toBeCloseTo(-0.5)
  })

  test('clamps nested palette pages', () => {
    expect(getPage([1, 2, 3, 4, 5], 9, 2)).toEqual({
      currentPage: 2,
      items: [5],
      pageCount: 3,
    })
  })
})
