import type { WallNode } from '../../schema/nodes/wall'
import { getWallChordFrame } from './wall-curve'

const references = new WeakMap<WallNode, WallNode>()

export function wallTopReference(wall: WallNode): WallNode {
  const reference = wall.topProfile?.supportReference
  if (!reference) return wall
  const cached = references.get(wall)
  if (cached) return cached
  const frame = getWallChordFrame(wall)
  const world = ([x, y]: [number, number]): [number, number] => [
    frame.start.x + frame.length * (x * frame.tangent.x + y * frame.normal.x),
    frame.start.y + frame.length * (x * frame.tangent.y + y * frame.normal.y),
  ]
  const result: WallNode = {
    ...wall,
    topProfile: undefined,
    start: world(reference.start),
    end: world(reference.end),
    curveOffset:
      reference.curveOffset === undefined ? undefined : reference.curveOffset * frame.length,
    height: reference.height,
    supportOffset: (wall.supportOffset ?? 0) + (reference.supportOffsetDelta ?? 0),
  }
  references.set(wall, result)
  return result
}

export function captureWallTopReference({
  source,
  segment,
}: {
  source: WallNode
  segment: Pick<WallNode, 'start' | 'end'>
}): NonNullable<NonNullable<WallNode['topProfile']>['supportReference']> {
  const original = wallTopReference(source)
  const frame = getWallChordFrame(segment)
  const local = ([x, y]: [number, number]): [number, number] => {
    const dx = x - frame.start.x
    const dy = y - frame.start.y
    return [
      (dx * frame.tangent.x + dy * frame.tangent.y) / frame.length,
      (dx * frame.normal.x + dy * frame.normal.y) / frame.length,
    ]
  }
  return {
    start: local(original.start),
    end: local(original.end),
    ...(original.curveOffset === undefined
      ? {}
      : { curveOffset: original.curveOffset / frame.length }),
    ...(original.height === undefined ? {} : { height: original.height }),
    ...((original.supportOffset ?? 0) === (source.supportOffset ?? 0)
      ? {}
      : {
          supportOffsetDelta: (original.supportOffset ?? 0) - (source.supportOffset ?? 0),
        }),
  }
}
