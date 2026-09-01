import { type PolygonBooleanPoint2D as Point2D, unionPolygons } from '@aedifex/core'

export function mergeSurfaceHolePolygons(holes: Point2D[][]): Point2D[][] {
  return unionPolygons(holes)
}
