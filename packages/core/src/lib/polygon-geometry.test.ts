import { describe, expect, test } from 'bun:test'
import { insetPolygonFromCentroid, simplifyClosedPolygon } from './polygon-geometry'

describe('insetPolygonFromCentroid', () => {
  test('inset <= 0 returns polygon copy unchanged', () => {
    const poly: Array<[number, number]> = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ]
    const result = insetPolygonFromCentroid(poly, 0)
    expect(result).toEqual(poly)
    // It should be a copy, not the same array reference
    expect(result).not.toBe(poly)
  })

  test('inset shrinks polygon symmetrically around centroid', () => {
    const poly: Array<[number, number]> = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ]
    const result = insetPolygonFromCentroid(poly, 0.5)
    // Centroid at (2,2). Each vertex was sqrt(8) from centroid; after inset:
    // new distance = sqrt(8) - 0.5, scale = (sqrt(8) - 0.5) / sqrt(8)
    const expectedScale = (Math.sqrt(8) - 0.5) / Math.sqrt(8)
    // Vertex (0,0): dx=-2, dz=-2 → new pos = (2 + -2*scale, 2 + -2*scale)
    expect(result[0]![0]).toBeCloseTo(2 - 2 * expectedScale, 5)
    expect(result[0]![1]).toBeCloseTo(2 - 2 * expectedScale, 5)
  })

  test('inset >= distance to centroid: vertex returned unchanged (guard)', () => {
    const poly: Array<[number, number]> = [
      [0, 0],
      [1, 0],
      [0.5, 1],
    ]
    // Inset larger than any vertex-to-centroid distance — should pass through
    const result = insetPolygonFromCentroid(poly, 100)
    // For each vertex where length <= inset + 1e-6, the vertex returns unchanged
    expect(result).toEqual(poly)
  })

  test('empty polygon: returns empty (no divide-by-zero crash)', () => {
    const result = insetPolygonFromCentroid([], 0.5)
    expect(result).toEqual([])
  })
})

describe('simplifyClosedPolygon', () => {
  test('triangle (3 vertices) is never further simplified', () => {
    const tri: Array<[number, number]> = [
      [0, 0],
      [4, 0],
      [2, 4],
    ]
    const result = simplifyClosedPolygon(tri, 0.5)
    expect(result.length).toBe(3)
  })

  test('tolerance <= 0 returns deduped polygon unchanged', () => {
    const poly: Array<[number, number]> = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ]
    const result = simplifyClosedPolygon(poly, 0)
    expect(result.length).toBe(4)
  })

  test('dense collinear midpoints are removed at tolerance 0.08', () => {
    // Square with collinear midpoints
    const dense: Array<[number, number]> = [
      [0, 0],
      [2, 0],
      [4, 0],
      [4, 2],
      [4, 4],
      [2, 4],
      [0, 4],
      [0, 2],
    ]
    const result = simplifyClosedPolygon(dense, 0.08)
    expect(result.length).toBeLessThan(dense.length)
    expect(result.length).toBeGreaterThanOrEqual(3)
  })

  test('duplicate sequential points are deduplicated', () => {
    const dup: Array<[number, number]> = [
      [0, 0],
      [0, 0], // exact dup
      [4, 0],
      [4, 4],
      [0, 4],
    ]
    const result = simplifyClosedPolygon(dup, 0)
    // Dedupe drops the dup; we should have 4 vertices
    expect(result.length).toBe(4)
  })

  test('closing duplicate (last ~= first) is removed', () => {
    const closed: Array<[number, number]> = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
      [0, 0], // close vertex — should be dropped
    ]
    const result = simplifyClosedPolygon(closed, 0)
    expect(result.length).toBe(4)
  })
})
