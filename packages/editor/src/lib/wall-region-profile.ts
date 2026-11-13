import { MIN_WALL_END_HEIGHT, type WallFaceRegion } from '@aedifex/core'
import { faceBaseAt, type WallFaceBaseRuns } from './wall-region-snap'

export type WallRegionProfilePiece = {
  u0: number
  u1: number
  bottom: number
  top0: number
  top1: number
}

/** The visible region as pieces with a constant face base and linear top. */
export function wallRegionProfile({
  length,
  startTop,
  endTop,
  runs,
  region,
  minU = 0,
  maxU = length,
}: {
  length: number
  startTop: number
  endTop: number
  runs: WallFaceBaseRuns
  region: Pick<WallFaceRegion, 'u0' | 'u1' | 'v0' | 'v1'>
  minU?: number
  maxU?: number
}): WallRegionProfilePiece[] {
  const start = Math.max(minU, region.u0 ?? minU)
  const end = Math.min(maxU, region.u1 ?? maxU)
  if (!(length > 1e-9 && end > start)) return []
  const boundaries = [start, end]
  for (const run of runs ?? []) {
    for (const u of [run.start, run.end]) if (u > start && u < end) boundaries.push(u)
  }
  boundaries.sort((a, b) => a - b)
  const slope = (endTop - startTop) / length
  const minimum = Math.min(startTop, MIN_WALL_END_HEIGHT)
  const top = (u: number) => Math.max(minimum, startTop + slope * u)
  const pieces: WallRegionProfilePiece[] = []
  for (let i = 0; i < boundaries.length - 1; i++) {
    const startU = boundaries[i]!
    const endU = boundaries[i + 1]!
    if (endU - startU < 1e-9) continue
    const base = faceBaseAt(runs, (startU + endU) / 2)
    const bottom = base + Math.max(0, region.v0 ?? 0)
    const cap = region.v1 === undefined ? Number.POSITIVE_INFINITY : base + region.v1
    if (cap <= bottom) continue
    const stations = [startU, endU]
    if (Math.abs(slope) > 1e-12) {
      for (const y of [bottom, cap, minimum]) {
        const u = (y - startTop) / slope
        if (Number.isFinite(u) && u > startU + 1e-9 && u < endU - 1e-9) stations.push(u)
      }
    }
    stations.sort((a, b) => a - b)
    for (let j = 0; j < stations.length - 1; j++) {
      const u0 = stations[j]!
      const u1 = stations[j + 1]!
      if (Math.min(cap, top((u0 + u1) / 2)) <= bottom) continue
      pieces.push({ u0, u1, bottom, top0: Math.min(cap, top(u0)), top1: Math.min(cap, top(u1)) })
    }
  }
  return pieces
}
