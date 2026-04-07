import {
  type AnyNode,
  type AnyNodeId,
  type WallNode,
  type ZoneNode,
  pointInPolygon,
  useScene,
} from '@aedifex/core'

// ============================================================================
// Spatial Query Utilities
// ============================================================================

/**
 * Collect all WallNode instances belonging to a given level.
 * Accepts an optional cache map to avoid redundant tree traversals
 * when called multiple times for the same level within a batch.
 */
export function getWallsForLevel(levelId: string, wallCache?: Map<string, WallNode[]>): WallNode[] {
  if (wallCache) {
    const cached = wallCache.get(levelId)
    if (cached) return cached
  }

  const { nodes } = useScene.getState()
  const walls: WallNode[] = []
  const visited = new Set<string>()
  const queue: string[] = [levelId]

  while (queue.length > 0) {
    const nodeId = queue.shift()!
    if (visited.has(nodeId)) continue
    visited.add(nodeId)

    const node = nodes[nodeId as AnyNodeId] as AnyNode | undefined
    if (!node) continue

    if (node.type === 'wall') {
      walls.push(node as WallNode)
    }
    if ('children' in node && Array.isArray(node.children)) {
      for (const childId of node.children) {
        queue.push(childId as string)
      }
    }
  }

  if (wallCache) {
    wallCache.set(levelId, walls)
  }
  return walls
}

/**
 * Collect height-related context for a level: wall height, ceilings, tallest item.
 * Used by multiple validators to enforce vertical spatial constraints.
 */
export function getLevelHeightContext(levelId: string): {
  wallHeight: number
  ceilings: { id: string; height: number; polygon: [number, number][] }[]
  tallestItemHeight: number
} {
  const { nodes } = useScene.getState()
  const walls = getWallsForLevel(levelId)
  const wallHeight = walls.length > 0
    ? Math.max(...walls.map((w) => w.height ?? 2.5))
    : 2.5

  const ceilings: { id: string; height: number; polygon: [number, number][] }[] = []
  let tallestItemHeight = 0

  const visited = new Set<string>()
  const queue = [levelId]
  while (queue.length > 0) {
    const nid = queue.shift()!
    if (visited.has(nid)) continue
    visited.add(nid)
    const node = nodes[nid as AnyNodeId]
    if (!node) continue
    if (node.type === 'ceiling') {
      const cn = node as { id: string; height?: number; polygon: [number, number][] }
      ceilings.push({ id: cn.id, height: cn.height ?? 2.5, polygon: cn.polygon })
    }
    if (node.type === 'item' && !(node as { asset: { attachTo?: string } }).asset.attachTo) {
      const dims = ((node as { asset: { dimensions?: number[] } }).asset.dimensions ?? [1, 1, 1]) as number[]
      const topY = ((node as { position: number[] }).position[1] ?? 0) + (dims[1] ?? 1)
      if (topY > tallestItemHeight) tallestItemHeight = topY
    }
    if ('children' in node && Array.isArray(node.children)) {
      for (const cid of node.children) queue.push(cid as string)
    }
  }

  return { wallHeight, ceilings, tallestItemHeight }
}

/**
 * Find the ceiling that covers a given XZ position.
 * Returns the ceiling height if found, null otherwise.
 */
export function getCeilingAtPosition(
  x: number,
  z: number,
  ceilings: { id: string; height: number; polygon: [number, number][] }[],
): number | null {
  for (const c of ceilings) {
    if (c.polygon.length >= 3 && pointInPolygon(x, z, c.polygon)) {
      return c.height
    }
  }
  return null
}

/**
 * Get the maximum wall thickness for walls bordering a level.
 * Used to compute safe interior margin for furniture placement.
 */
export function getMaxWallThickness(levelId: string): number {
  const walls = getWallsForLevel(levelId)
  if (walls.length === 0) return 0.2 // default
  return Math.max(...walls.map((w) => w.thickness ?? 0.2))
}

/**
 * Collect all ZoneNode instances belonging to a given level.
 */
export function getZonesForLevel(levelId: string): ZoneNode[] {
  const { nodes } = useScene.getState()
  const zones: ZoneNode[] = []
  const visited = new Set<string>()
  const queue: string[] = [levelId]

  while (queue.length > 0) {
    const nodeId = queue.shift()!
    if (visited.has(nodeId)) continue
    visited.add(nodeId)

    const node = nodes[nodeId as AnyNodeId] as AnyNode | undefined
    if (!node) continue

    if (node.type === 'zone') {
      zones.push(node as ZoneNode)
    }
    if ('children' in node && Array.isArray(node.children)) {
      for (const childId of node.children) {
        queue.push(childId as string)
      }
    }
  }
  return zones
}
