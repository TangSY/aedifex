import {
  type AnyNode,
  type AnyNodeId,
  type WallNode,
  type ZoneNode,
  pointInPolygon,
  useScene,
} from '@aedifex/core'
import { useViewer } from '@aedifex/viewer'

// ============================================================================
// Spatial Query Utilities
// ============================================================================

/**
 * Resolve the effective level ID for an operation.
 * If an explicit levelId is provided (from the LLM tool call), validates that
 * the node exists and is a level node. Falls back to the viewer's selected level.
 * Returns null if no valid level can be resolved.
 */
export function resolveEffectiveLevelId(explicitLevelId?: string): string | null {
  if (explicitLevelId) {
    const { nodes } = useScene.getState()
    const node = nodes[explicitLevelId as AnyNodeId]
    if (node && node.type === 'level') {
      return explicitLevelId
    }
    // Invalid levelId from LLM — fall back to viewer selection
  }
  return useViewer.getState().selection.levelId
}

/**
 * True when the node is a transient ghost preview (not yet confirmed) or a
 * pending ghost removal. Mid-preview tool calls must not treat these as real
 * geometry — otherwise validators reject placements against deleted walls or
 * count walls that haven't been accepted yet. Mirrors the filter in
 * ai-scene-serializer.ts so the LLM sees consistent reality across both
 * scene summaries and spatial queries.
 */
function isGhostNode(node: AnyNode): boolean {
  if ((node as { visible?: boolean }).visible === false) return true
  const meta = node.metadata as Record<string, unknown> | undefined
  return meta?.isGhostPreview === true || meta?.isGhostRemoval === true
}

/**
 * Walk up the parent chain from `nodeId` until a node of type `level` is found.
 * Returns null if no level ancestor exists. Defensive against future nesting
 * (e.g., wall → group → level) — the previous single-step lookup would miss
 * those, falsely falling back to viewer.selection and silently writing to the
 * wrong level. Cycle-guarded via depth limit.
 */
export function findAncestorLevelId(nodeId: string): AnyNodeId | null {
  const { nodes } = useScene.getState()
  let currentId: string | null = nodeId
  // 32 is more than any plausible nesting depth — also acts as cycle guard.
  for (let i = 0; i < 32 && currentId; i++) {
    const node: AnyNode | undefined = nodes[currentId as AnyNodeId]
    if (!node) return null
    if (node.type === 'level') return currentId as AnyNodeId
    currentId = (node.parentId as string | null) ?? null
  }
  return null
}

/**
 * Collect all WallNode instances belonging to a given level.
 * Accepts an optional cache map to avoid redundant tree traversals
 * when called multiple times for the same level within a batch.
 *
 * Skips ghost-preview / ghost-removal walls so mid-preview validations
 * see the same scene the LLM sees in summaries.
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

    if (node.type === 'wall' && !isGhostNode(node)) {
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
    // Same ghost filter as walls — ghost ceilings/items must not influence
    // the height context the AI uses for placement decisions.
    if (isGhostNode(node)) continue
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
 * Skips ghost zones for the same reason getWallsForLevel does.
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

    if (node.type === 'zone' && !isGhostNode(node)) {
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
