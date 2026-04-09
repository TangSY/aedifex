import type { WallNode } from '@aedifex/core'
import { useScene } from '@aedifex/core'
import { getPlacementMeta, isAgainstWall, isCornerItem } from './furniture-placement-metadata'
import type { ValidatedAddItem, ValidatedMoveItem, ValidatedOperation } from './types'

// ============================================================================
// Layout Optimizer
// Post-validation optimizer for AI-generated placement operations:
// wall snapping, functional group spacing, walkway clearance, symmetry correction.
// Runs after mutation executor validation, before ghost preview.
// ============================================================================

/** Wall snap threshold in meters */
const WALL_SNAP_THRESHOLD = 0.3
/** Standard gap between item and wall surface (meters), used for flush placement */
const WALL_OFFSET = 0.05

// ============================================================================
// Functional Group Spacing Rules
// ============================================================================

interface SpacingRule {
  /** Primary item's category or catalogSlug keywords */
  primary: string[]
  /** Companion item's category or catalogSlug keywords */
  companion: string[]
  /** Ideal edge-to-edge gap in meters */
  idealDistance: number
  /** Allowed deviation in meters */
  tolerance: number
}

const SPACING_RULES: SpacingRule[] = [
  {
    primary: ['sofa', 'couch'],
    companion: ['coffee-table', 'tea-table'],
    idealDistance: 0.4,
    tolerance: 0.15,
  },
  {
    primary: ['sofa', 'couch'],
    companion: ['tv-stand', 'tv-cabinet'],
    idealDistance: 2.5,
    tolerance: 0.5,
  },
  {
    primary: ['bed'],
    companion: ['nightstand', 'bedside'],
    idealDistance: 0.0,
    tolerance: 0.15,
  },
  {
    primary: ['dining-table'],
    companion: ['dining-chair', 'chair'],
    idealDistance: 0.55,
    tolerance: 0.1,
  },
]

// ============================================================================
// Against-Wall Item Categories
// Now driven by furniture-placement-metadata.ts for richer semantics.
// ============================================================================

// ============================================================================
// Public API
// ============================================================================

/**
 * Optimize a set of validated operations for better layout.
 * Only adjusts valid/adjusted add_item and move_item operations.
 */
export function optimizeLayout(operations: ValidatedOperation[]): ValidatedOperation[] {
  return operations.map((op) => {
    if (op.status === 'invalid') return op

    if (op.type === 'add_item') {
      return optimizeAddItem(op, operations)
    }
    if (op.type === 'move_item') {
      return optimizeMoveItem(op, operations)
    }
    return op
  })
}

// ============================================================================
// Per-Item Optimization
// ============================================================================

function optimizeAddItem(
  op: ValidatedAddItem,
  allOps: ValidatedOperation[],
): ValidatedAddItem {
  if (op.status === 'invalid' || !op.asset) return op

  let position = [...op.position] as [number, number, number]
  let rotation = [...op.rotation] as [number, number, number]
  const reasons: string[] = []

  // Retrieve metadata for future minClearance usage
  const _meta = getPlacementMeta(op.asset.id, op.asset.category)
  void _meta

  // 1. Against-wall / corner items -> wall snap alignment
  if (isAgainstWallItem(op.asset.id, op.asset.category) || isCornerPlacement(op.asset.id, op.asset.category)) {
    const dims: [number, number, number] = [
      op.asset.dimensions?.[0] ?? 1,
      op.asset.dimensions?.[1] ?? 1,
      op.asset.dimensions?.[2] ?? 1,
    ]
    // Fetch walls once and reuse for both snap and orientation checks
    const walls = getAllWalls()
    const wallSnap = snapToNearestWall(position, dims, rotation, walls)
    if (wallSnap) {
      position = wallSnap.position
      rotation = wallSnap.rotation
      reasons.push('snapped to nearest wall')
    }

    // Orientation enforcement: ensure against-wall items face room interior.
    // snapToNearestWall has a small threshold (0.3m) — most correctly placed items won't trigger it.
    // This uses a larger threshold to correct orientation only, without changing position.
    const orientFix = enforceAgainstWallOrientation(position, dims, rotation, walls)
    if (orientFix) {
      rotation = orientFix.rotation
      reasons.push('orientation corrected to face room interior')
    }
  }

  // 2. Functional group spacing check (relative to other items in the same batch)
  const spacingAdj = adjustForGroupSpacing(
    op.asset.id,
    op.asset.category,
    position,
    [op.asset.dimensions?.[0] ?? 1, op.asset.dimensions?.[1] ?? 1, op.asset.dimensions?.[2] ?? 1],
    allOps,
  )
  if (spacingAdj) {
    position = spacingAdj.position
    reasons.push(spacingAdj.reason)
  }

  if (reasons.length === 0) return op

  return {
    ...op,
    position,
    rotation,
    status: 'adjusted',
    adjustmentReason: [op.adjustmentReason, ...reasons].filter(Boolean).join(' '),
  }
}

function optimizeMoveItem(
  op: ValidatedMoveItem,
  _allOps: ValidatedOperation[],
): ValidatedMoveItem {
  if (op.status === 'invalid') return op

  // move_item optimization is conservative — wall snapping only
  const { nodes } = useScene.getState()
  const node = nodes[op.nodeId]
  if (!node || node.type !== 'item') return op

  let position = [...op.position] as [number, number, number]
  let rotation = [...op.rotation] as [number, number, number]
  const reasons: string[] = []

  if (isAgainstWallItem(node.asset.id, node.asset.category) || isCornerPlacement(node.asset.id, node.asset.category)) {
    // Fetch walls once and reuse for both snap and orientation checks
    const walls = getAllWalls()
    const wallSnap = snapToNearestWall(position, node.asset.dimensions, rotation, walls)
    if (wallSnap) {
      position = wallSnap.position
      rotation = wallSnap.rotation
      reasons.push('snapped to nearest wall')
    }

    const orientFix = enforceAgainstWallOrientation(position, node.asset.dimensions, rotation, walls)
    if (orientFix) {
      rotation = orientFix.rotation
      reasons.push('orientation corrected to face room interior')
    }
  }

  if (reasons.length === 0) return op

  return {
    ...op,
    position,
    rotation,
    status: 'adjusted',
    adjustmentReason: [op.adjustmentReason, ...reasons].filter(Boolean).join(' '),
  }
}

// ============================================================================
// Wall Snap Alignment
// ============================================================================

function snapToNearestWall(
  position: [number, number, number],
  dimensions: [number, number, number],
  _rotation: [number, number, number],
  walls?: WallNode[],
): { position: [number, number, number]; rotation: [number, number, number] } | null {
  const resolvedWalls = walls ?? getAllWalls()
  if (resolvedWalls.length === 0) return null

  const [px, py, pz] = position
  let bestWall: WallNode | null = null
  let bestDist = WALL_SNAP_THRESHOLD
  let bestClosestPoint: [number, number] = [0, 0]

  for (const wall of resolvedWalls) {
    // Find closest point on wall segment to item center
    const { closestPoint, distance } = closestPointOnSegment(
      px, pz,
      wall.start[0], wall.start[1],
      wall.end[0], wall.end[1],
    )

    if (distance < bestDist) {
      bestDist = distance
      bestWall = wall
      bestClosestPoint = closestPoint
    }
  }

  if (!bestWall) return null

  // Compute wall normal direction
  const wallDx = bestWall.end[0] - bestWall.start[0]
  const wallDz = bestWall.end[1] - bestWall.start[1]
  const wallLen = Math.hypot(wallDx, wallDz)
  if (wallLen < 0.01) return null

  // Normal = wall direction rotated 90 degrees
  const normalX = -wallDz / wallLen
  const normalZ = wallDx / wallLen

  // Determine which side of the normal the item is on (keep item on its current side)
  const toCenterX = px - bestClosestPoint[0]
  const toCenterZ = pz - bestClosestPoint[1]
  const side = Math.sign(toCenterX * normalX + toCenterZ * normalZ) || 1

  // Compute item facing direction: face along normal (toward room interior).
  // Must compute faceAngle first, then use final rotation for dimension projection.
  // Otherwise halfDepth/halfWidth use original rotation but we return a new one, causing wall-clamping inaccuracy.
  const faceAngle = Math.atan2(side * normalX, side * normalZ)

  const [w, , d] = dimensions
  const wallAngle = Math.atan2(wallDz, wallDx)
  // Use final rotation angle (faceAngle) instead of original for dimension projection
  const angleDiff = Math.abs(normalizeAngle(faceAngle - wallAngle))
  // Pick w or d as depth (perpendicular to wall) based on item orientation
  const halfDepth = (angleDiff < Math.PI / 4 || angleDiff > (3 * Math.PI) / 4)
    ? d / 2
    : w / 2

  const thickness = bestWall.thickness ?? 0.2
  const offset = thickness / 2 + halfDepth + WALL_OFFSET

  // New position: offset from closest point along normal direction
  let newX = bestClosestPoint[0] + normalX * side * offset
  let newZ = bestClosestPoint[1] + normalZ * side * offset

  // Clamp item along wall direction so it doesn't overshoot wall endpoints.
  // Item half-width (parallel to wall) must not exceed wall bounds.
  const halfWidth = (angleDiff < Math.PI / 4 || angleDiff > (3 * Math.PI) / 4)
    ? w / 2
    : d / 2
  const wallDirX = wallDx / wallLen
  const wallDirZ = wallDz / wallLen
  // Project item center onto wall segment; t = position along wall (0=start, wallLen=end)
  const t = (newX - bestWall.start[0]) * wallDirX + (newZ - bestWall.start[1]) * wallDirZ
  const margin = halfWidth + thickness / 2
  // If item is wider than wall, skip endpoint clamping (zone boundary check handles this)
  if (margin * 2 > wallLen) return { position: [newX, py, newZ], rotation: [0, faceAngle, 0] }
  const clampedT = Math.max(margin, Math.min(wallLen - margin, t))
  if (Math.abs(clampedT - t) > 0.01) {
    // Slide item along wall to stay within endpoints
    newX += wallDirX * (clampedT - t)
    newZ += wallDirZ * (clampedT - t)
  }

  return {
    position: [newX, py, newZ],
    rotation: [0, faceAngle, 0],
  }
}

// ============================================================================
// Against-Wall Item Orientation Enforcement
// ============================================================================

/**
 * Enforce correct orientation for against-wall items, ensuring front (+Z) faces room interior.
 * Unlike snapToNearestWall:
 * - Uses a larger threshold (item depth + margin) to cover normally placed items
 * - Only corrects rotation, does not change position
 * - Only corrects when facing is clearly wrong (toward wall instead of room)
 */
function enforceAgainstWallOrientation(
  position: [number, number, number],
  dimensions: [number, number, number],
  rotation: [number, number, number],
  walls?: WallNode[],
): { rotation: [number, number, number] } | null {
  const resolvedWalls = walls ?? getAllWalls()
  if (resolvedWalls.length === 0) return null

  const [px, , pz] = position
  const [, , depth] = dimensions

  // Threshold: item depth + margin, ensuring normally placed against-wall items are detected
  const threshold = Math.max(depth, 1.5) + 0.5
  let bestWall: WallNode | null = null
  let bestDist = threshold
  let bestClosestPoint: [number, number] = [0, 0]

  for (const wall of resolvedWalls) {
    const { closestPoint, distance } = closestPointOnSegment(
      px, pz,
      wall.start[0], wall.start[1],
      wall.end[0], wall.end[1],
    )
    if (distance < bestDist) {
      bestDist = distance
      bestWall = wall
      bestClosestPoint = closestPoint
    }
  }

  if (!bestWall) return null

  // Compute wall normal
  const wallDx = bestWall.end[0] - bestWall.start[0]
  const wallDz = bestWall.end[1] - bestWall.start[1]
  const wallLen = Math.hypot(wallDx, wallDz)
  if (wallLen < 0.01) return null

  const normalX = -wallDz / wallLen
  const normalZ = wallDx / wallLen

  // Determine which side of the wall the item is on
  const toCenterX = px - bestClosestPoint[0]
  const toCenterZ = pz - bestClosestPoint[1]
  const side = Math.sign(toCenterX * normalX + toCenterZ * normalZ) || 1

  // Correct orientation: front faces away from wall, toward room interior
  const correctAngle = Math.atan2(side * normalX, side * normalZ)

  // Check if current facing deviates more than 90 degrees (facing wall instead of room)
  const currentAngle = rotation[1]
  const angleDiff = Math.abs(normalizeAngle(currentAngle - correctAngle))

  if (angleDiff <= Math.PI / 2) {
    // Orientation is roughly correct (deviation < 90 degrees), no intervention needed
    return null
  }

  // Orientation is clearly wrong (facing wall), correct to face room interior
  return { rotation: [0, correctAngle, 0] }
}

// ============================================================================
// Functional Group Spacing
// ============================================================================

/**
 * Compute item half-extent along a given axis direction, accounting for rotation.
 * rotationY affects how width(X) and depth(Z) project onto world axes.
 */
function halfExtentAlongAxis(
  dimensions: [number, number, number],
  rotationY: number,
  axisX: number,
  axisZ: number,
): number {
  const [w, , d] = dimensions
  const cosR = Math.abs(Math.cos(rotationY))
  const sinR = Math.abs(Math.sin(rotationY))
  // Item projection onto world X/Z axes
  const worldHalfX = (w * cosR + d * sinR) / 2
  const worldHalfZ = (w * sinR + d * cosR) / 2
  // Project onto the specified axis direction
  const axisLen = Math.hypot(axisX, axisZ)
  if (axisLen < 0.001) return Math.max(worldHalfX, worldHalfZ)
  const nx = Math.abs(axisX / axisLen)
  const nz = Math.abs(axisZ / axisLen)
  return worldHalfX * nx + worldHalfZ * nz
}

function adjustForGroupSpacing(
  assetId: string,
  category: string,
  position: [number, number, number],
  dimensions: [number, number, number],
  allOps: ValidatedOperation[],
): { position: [number, number, number]; reason: string } | null {
  const slug = assetId.toLowerCase()
  const cat = category.toLowerCase()

  for (const rule of SPACING_RULES) {
    // Check if current item is a companion
    const isCompanion = rule.companion.some((k) => slug.includes(k) || cat.includes(k))
    if (!isCompanion) continue

    // Find primary item in the same batch
    for (const op of allOps) {
      if (op.type !== 'add_item' || op.status === 'invalid' || !op.asset) continue
      const opSlug = op.asset.id.toLowerCase()
      const opCat = op.asset.category.toLowerCase()
      const isPrimary = rule.primary.some((k) => opSlug.includes(k) || opCat.includes(k))
      if (!isPrimary) continue

      // Compute along primary item's facing direction (front = +Z after rotation)
      const primaryRotY = op.rotation[1]
      // Facing axis: at rotationY=0 front faces +Z, after rotation faces (sin(rotY), cos(rotY))
      const facingX = Math.sin(primaryRotY)
      const facingZ = Math.cos(primaryRotY)

      // Project companion-to-primary offset onto facing axis
      const dx = position[0] - op.position[0]
      const dz = position[2] - op.position[2]
      const projectedDist = dx * facingX + dz * facingZ // signed distance along facing axis

      // Compute half-extents of both items along facing axis
      const primaryHalf = halfExtentAlongAxis(
        [op.asset.dimensions?.[0] ?? 1, op.asset.dimensions?.[1] ?? 1, op.asset.dimensions?.[2] ?? 1],
        primaryRotY, facingX, facingZ,
      )
      const companionRotY = 0 // companion has not been rotation-corrected yet, use default
      const companionHalf = halfExtentAlongAxis(dimensions, companionRotY, facingX, facingZ)

      // Edge-to-edge gap = center distance - both half-extents
      const absDist = Math.abs(projectedDist)
      const edgeGap = absDist - primaryHalf - companionHalf
      const diff = edgeGap - rule.idealDistance

      if (Math.abs(diff) <= rule.tolerance) continue
      if (absDist < 0.01) continue // overlapping, skip

      // Target center distance = both half-extents + ideal edge gap
      const targetCenterDist = primaryHalf + rule.idealDistance + companionHalf
      // Keep companion on the same side of primary (preserve sign)
      const sign = projectedDist >= 0 ? 1 : -1
      // Adjust only along facing axis, preserve lateral offset
      const lateralX = dx - projectedDist * facingX
      const lateralZ = dz - projectedDist * facingZ
      const newX = op.position[0] + lateralX + facingX * sign * targetCenterDist
      const newZ = op.position[2] + lateralZ + facingZ * sign * targetCenterDist

      return {
        position: [newX, position[1], newZ],
        reason: `adjusted edge gap to ${rule.primary[0]} to ${rule.idealDistance}m`,
      }
    }
  }

  return null
}

// ============================================================================
// Utility Functions
// ============================================================================

function isAgainstWallItem(assetId: string, category: string): boolean {
  return isAgainstWall(assetId, category)
}

function isCornerPlacement(assetId: string, category: string): boolean {
  return isCornerItem(assetId, category)
}

function getAllWalls(): WallNode[] {
  const { nodes } = useScene.getState()
  const walls: WallNode[] = []
  for (const node of Object.values(nodes)) {
    if ((node as { type: string }).type === 'wall') {
      walls.push(node as WallNode)
    }
  }
  return walls
}

function closestPointOnSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { closestPoint: [number, number]; distance: number } {
  const dx = bx - ax
  const dz = bz - az
  const lenSq = dx * dx + dz * dz
  if (lenSq === 0) {
    return { closestPoint: [ax, az], distance: Math.hypot(px - ax, pz - az) }
  }

  let t = ((px - ax) * dx + (pz - az) * dz) / lenSq
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * dx
  const cz = az + t * dz
  return { closestPoint: [cx, cz], distance: Math.hypot(px - cx, pz - cz) }
}

/** Normalize angle to [-PI, PI] range */
function normalizeAngle(angle: number): number {
  while (angle > Math.PI) angle -= 2 * Math.PI
  while (angle < -Math.PI) angle += 2 * Math.PI
  return angle
}
