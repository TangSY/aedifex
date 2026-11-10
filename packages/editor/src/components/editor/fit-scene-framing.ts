import type { SceneBoundsXZ } from '../../lib/scene-bounds'

export type SceneFit = { bounds: SceneBoundsXZ | null }

export function createAutoFrameQueue() {
  let pending: SceneFit | null = null
  return {
    request: (bounds: SceneBoundsXZ | null) => {
      pending = { bounds }
    },
    cancel: () => {
      pending = null
    },
    take: ({ ready, superseded }: { ready: boolean; superseded: boolean }): SceneFit | null => {
      if (superseded) pending = null
      if (!ready || !pending) return null
      const result = pending
      pending = null
      return result
    },
  }
}

export function sceneFitPose({
  bounds,
  groundY,
}: {
  bounds: SceneBoundsXZ | null
  groundY: number
}) {
  if (!bounds)
    return {
      eye: [20, groundY + 20, 20] as const,
      target: [0, groundY, 0] as const,
      radius: 15,
      height: 20,
    }
  const [x, z] = bounds.center
  const [width, depth] = bounds.size
  const extent = Math.max(width, depth)
  const distance = Math.max(extent * 1.4, 15)
  const height = Math.max(extent * 0.8, 10)
  return {
    eye: [x + distance * 0.7, groundY + height, z + distance * 0.7] as const,
    target: [x, groundY, z] as const,
    radius: Math.max(Math.hypot(width, depth) * 0.65, 5),
    height,
  }
}
