import { intersection, type Polygon } from '@aedifex/core'

export type WallSlopeFootprint = { polygon: Polygon; clamped: boolean }

/** Split an IFC-local wall footprint where its sloping top reaches its minimum height. */
export function wallSlopeFootprints({
  polygon,
  startHeight,
  slope,
  crossSlope = 0,
  minimum,
}: {
  polygon: Polygon
  startHeight: number
  slope: number
  crossSlope?: number
  minimum: number
}): WallSlopeFootprint[] {
  const magnitude = Math.hypot(slope, crossSlope)
  if (magnitude < 1e-12) return [{ polygon, clamped: startHeight < minimum }]
  const rotate = ([x, y]: [number, number]): [number, number] => [
    (slope * x + crossSlope * y) / magnitude,
    (-crossSlope * x + slope * y) / magnitude,
  ]
  const unrotate = ([x, y]: [number, number]): [number, number] => [
    (slope * x - crossSlope * y) / magnitude,
    (crossSlope * x + slope * y) / magnitude,
  ]
  const transformed = {
    outer: polygon.outer.map(rotate),
    holes: polygon.holes.map((ring) => ring.map(rotate)),
  }
  const xs = transformed.outer.map(([x]) => x)
  const ys = transformed.outer.map(([, y]) => y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys) - 1
  const maxY = Math.max(...ys) + 1
  const station = (minimum - startHeight) / magnitude
  if (station <= minX + 1e-6 || station >= maxX - 1e-6)
    return [{ polygon, clamped: startHeight + magnitude * ((minX + maxX) / 2) < minimum }]
  const band = (left: number, right: number): [number, number][] => [
    [left, minY],
    [right, minY],
    [right, maxY],
    [left, maxY],
  ]
  const below = intersection(transformed, band(minX - 1, station))
  const above = intersection(transformed, band(station, maxX + 1))
  if (!below.length || !above.length)
    throw new Error('Unable to preserve the complete sloped wall footprint in IFC export')
  return [
    ...below.map((part) => ({
      polygon: {
        outer: part.outer.map(unrotate),
        holes: part.holes.map((ring) => ring.map(unrotate)),
      },
      clamped: true,
    })),
    ...above.map((part) => ({
      polygon: {
        outer: part.outer.map(unrotate),
        holes: part.holes.map((ring) => ring.map(unrotate)),
      },
      clamped: false,
    })),
  ]
}
