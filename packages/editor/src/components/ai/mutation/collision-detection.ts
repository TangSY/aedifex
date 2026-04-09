import { pointInPolygon } from '@aedifex/core'
import { getWallsForLevel, getZonesForLevel, getMaxWallThickness } from './spatial-queries'

export { getMaxWallThickness }

// ============================================================================
// Collision Detection
// ============================================================================

/**
 * Compute the item's axis-aligned bounding box in the XZ plane.
 * Returns { minX, maxX, minZ, maxZ }.
 */
export function getItemAABB(
  position: [number, number, number],
  dimensions: [number, number, number],
  rotation: [number, number, number],
): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const [x, , z] = position
  const [w, , d] = dimensions
  const yRot = rotation[1]
  const cos = Math.cos(yRot)
  const sin = Math.sin(yRot)
  const halfW = w / 2
  const halfD = d / 2

  // 4 corners of the rotated footprint
  const corners: [number, number][] = [
    [x + (-halfW * cos + halfD * sin), z + (-halfW * sin - halfD * cos)],
    [x + (halfW * cos + halfD * sin), z + (halfW * sin - halfD * cos)],
    [x + (halfW * cos - halfD * sin), z + (halfW * sin + halfD * cos)],
    [x + (-halfW * cos - halfD * sin), z + (-halfW * sin + halfD * cos)],
  ]

  const xs = corners.map((c) => c[0])
  const zs = corners.map((c) => c[1])
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  }
}

/**
 * Compute the 4 XZ footprint corners of an item given its position, dimensions, and Y rotation.
 */
export function getItemCorners(
  position: [number, number, number],
  dimensions: [number, number, number],
  rotation: [number, number, number],
): [number, number][] {
  const [x, , z] = position
  const [w, , d] = dimensions
  const yRot = rotation[1]
  const halfW = w / 2
  const halfD = d / 2
  const cos = Math.cos(yRot)
  const sin = Math.sin(yRot)

  return [
    [x + (-halfW * cos + halfD * sin), z + (-halfW * sin - halfD * cos)],
    [x + (halfW * cos + halfD * sin), z + (halfW * sin - halfD * cos)],
    [x + (halfW * cos - halfD * sin), z + (halfW * sin + halfD * cos)],
    [x + (-halfW * cos - halfD * sin), z + (-halfW * sin + halfD * cos)],
  ]
}

/**
 * Compute item half-extent projected onto a given normal direction.
 * For an axis-aligned AABB with half-sizes (hx, hz), the projected half-extent
 * onto direction (nx, nz) is |nx|*hx + |nz|*hz (support function of AABB).
 */
export function itemHalfExtentOnNormal(
  itemHalfX: number,
  itemHalfZ: number,
  nx: number,
  nz: number,
): number {
  return Math.abs(nx) * itemHalfX + Math.abs(nz) * itemHalfZ
}

/**
 * Check if an item's AABB overlaps with any wall segment on the level.
 * If overlap detected, push the item perpendicular to the wall (away from
 * the wall center line, toward whichever side the item center is on).
 *
 * This works for both indoor and outdoor items — it directly tests against
 * wall geometry rather than inferring from zone polygons.
 */
export function checkWallCollision(
  position: [number, number, number],
  dimensions: [number, number, number],
  rotation: [number, number, number],
  levelId: string,
): { position: [number, number, number]; reason: string } | 'no-space' | null {
  const walls = getWallsForLevel(levelId)
  if (walls.length === 0) return null

  const [ix, iy, iz] = position
  const itemAABB = getItemAABB(position, dimensions, rotation)
  const itemHalfX = (itemAABB.maxX - itemAABB.minX) / 2
  const itemHalfZ = (itemAABB.maxZ - itemAABB.minZ) / 2

  // For each colliding wall, compute a push vector along the wall's actual normal.
  // Works for walls at any angle (horizontal, vertical, diagonal).
  let pushX = 0
  let pushZ = 0
  let hasCollision = false

  for (const wall of walls) {
    const thickness = wall.thickness ?? 0.2
    const halfThick = thickness / 2
    const wdx = wall.end[0] - wall.start[0]
    const wdz = wall.end[1] - wall.start[1]
    const wallLen = Math.hypot(wdx, wdz)
    if (wallLen < 0.01) continue

    const udx = wdx / wallLen
    const udz = wdz / wallLen

    // Project item center onto wall line
    const t = ((ix + pushX - wall.start[0]) * udx + (iz + pushZ - wall.start[1]) * udz) / wallLen
    if (t < -0.5 || t > wallLen + 0.5) continue

    // Wall normal (perpendicular)
    const nx = -udz
    const nz = udx
    const signedDist = (ix + pushX - wall.start[0]) * nx + (iz + pushZ - wall.start[1]) * nz

    // Item half-extent projected onto wall normal direction
    const halfExtent = itemHalfExtentOnNormal(itemHalfX, itemHalfZ, nx, nz)
    const minDist = halfThick + halfExtent + 0.02

    const penetration = minDist - Math.abs(signedDist)
    if (penetration <= 0.01) continue

    hasCollision = true
    const pushDir = signedDist >= 0 ? 1 : -1
    pushX += nx * pushDir * penetration
    pushZ += nz * pushDir * penetration
  }

  if (!hasCollision) return null

  // Verify: check if the pushed position still collides with any wall.
  // If so, the space is too tight (contradictory constraints).
  let stillCollides = false
  const newX = ix + pushX
  const newZ = iz + pushZ

  for (const wall of walls) {
    const thickness = wall.thickness ?? 0.2
    const halfThick = thickness / 2
    const wdx = wall.end[0] - wall.start[0]
    const wdz = wall.end[1] - wall.start[1]
    const wallLen = Math.hypot(wdx, wdz)
    if (wallLen < 0.01) continue

    const udx = wdx / wallLen
    const udz = wdz / wallLen
    const t = ((newX - wall.start[0]) * udx + (newZ - wall.start[1]) * udz) / wallLen
    if (t < -0.5 || t > wallLen + 0.5) continue

    const nx = -udz
    const nz = udx
    const signedDist = (newX - wall.start[0]) * nx + (newZ - wall.start[1]) * nz
    const halfExtent = itemHalfExtentOnNormal(itemHalfX, itemHalfZ, nx, nz)
    const minDist = halfThick + halfExtent + 0.02

    if (minDist - Math.abs(signedDist) > 0.01) {
      stillCollides = true
      break
    }
  }

  if (stillCollides) return 'no-space'

  if (Math.abs(pushX) < 0.005 && Math.abs(pushZ) < 0.005) {
    return null
  }

  return {
    position: [newX, iy, newZ],
    reason: 'Position adjusted to avoid overlapping with wall.',
  }
}

/**
 * Check if an item's position violates any zone boundary on the level.
 * Returns:
 * - null if fully inside a zone (no adjustment needed)
 * - 'too-large' if item cannot fit in any zone
 * - { position, reason } if the position was clamped to fit inside a zone
 */
export function checkZoneBoundary(
  position: [number, number, number],
  dimensions: [number, number, number],
  rotation: [number, number, number],
  levelId: string,
): { position: [number, number, number]; reason: string } | 'too-large' | null {
  const zones = getZonesForLevel(levelId)
  if (zones.length === 0) return null // No zones exist, skip check

  // Determine placement intent from item CENTER position:
  // - Center inside a zone → indoor placement → enforce wall inset
  // - Center outside all zones → outdoor placement → don't interfere
  const [x, y, z] = position
  const centerInZone = zones.find(
    (zone) => zone.polygon.length >= 3 && pointInPolygon(x, z, zone.polygon)
  )

  if (!centerInZone) {
    // Item center is outside all zones — outdoor placement, skip zone boundary check.
    // Wall collision is handled separately by checkWallCollision (below).
    return null
  }

  // Indoor placement — check if item fits properly inside the zone.
  // Wall thickness margin: zone polygon edges sit on wall center lines,
  // so inset by half wall thickness + clearance to prevent visual clipping.
  const maxWallThick = getMaxWallThickness(levelId)
  const WALL_INSET = maxWallThick / 2 + 0.02 // half wall thickness + 2cm clearance

  const corners = getItemCorners(position, dimensions, rotation)
  const allCornersInside = corners.every(([cx, cz]) => pointInPolygon(cx, cz, centerInZone.polygon))

  if (allCornersInside) {
    // All corners inside zone. Check if any corner is in the wall thickness area
    // (between wall center line and wall inner surface).
    const cornerInWallArea = corners.some(([cx, cz]) => {
      for (let i = 0; i < centerInZone.polygon.length; i++) {
        const j = (i + 1) % centerInZone.polygon.length
        const [ax, az] = centerInZone.polygon[i]!
        const [bx, bz] = centerInZone.polygon[j]!
        const edgeDx = bx - ax
        const edgeDz = bz - az
        const len2 = edgeDx * edgeDx + edgeDz * edgeDz
        if (len2 < 0.001) continue
        const t = Math.max(0, Math.min(1, ((cx - ax) * edgeDx + (cz - az) * edgeDz) / len2))
        const projX = ax + t * edgeDx
        const projZ = az + t * edgeDz
        const dist = Math.hypot(cx - projX, cz - projZ)
        if (dist < WALL_INSET) return true
      }
      return false
    })
    if (!cornerInWallArea) {
      return null // Fully inside with safe margin — no adjustment needed
    }
    // Corner(s) in wall thickness area — fall through to clamp inward
  }

  // Indoor item with corners outside zone or in wall area — clamp to wall inner surface
  const bestZone = centerInZone

  // Compute zone AABB
  const xs = bestZone.polygon.map((p) => p[0])
  const zs = bestZone.polygon.map((p) => p[1])
  const zoneMinX = Math.min(...xs)
  const zoneMaxX = Math.max(...xs)
  const zoneMinZ = Math.min(...zs)
  const zoneMaxZ = Math.max(...zs)

  // Compute item's AABB half-extents (accounts for rotation)
  const aabb = getItemAABB(position, dimensions, rotation)
  let halfExtentX = (aabb.maxX - aabb.minX) / 2
  let halfExtentZ = (aabb.maxZ - aabb.minZ) / 2

  // For items with approximately square footprint (width ≈ depth), the base is likely
  // circular (e.g. Round Carpet, round tables). The AABB corners overshoot the actual
  // circular edge by ~41%, so reduce the effective half-extents by ~15% to better
  // approximate the inscribed circle radius (circle radius = half the square side).
  const [dimW, , dimD] = dimensions
  const isCircularFootprint = Math.abs(dimW - dimD) < 0.1 && Math.min(dimW, dimD) > 0.3
  if (isCircularFootprint) {
    halfExtentX *= 0.85
    halfExtentZ *= 0.85
  }

  // Check if item can fit in the zone at all (with wall inset)
  const usableWidth = (zoneMaxX - zoneMinX) - WALL_INSET * 2
  const usableDepth = (zoneMaxZ - zoneMinZ) - WALL_INSET * 2
  if (halfExtentX * 2 > usableWidth || halfExtentZ * 2 > usableDepth) {
    // Try without inset — item might still fit if it's nearly the room size
    if (halfExtentX * 2 > (zoneMaxX - zoneMinX) || halfExtentZ * 2 > (zoneMaxZ - zoneMinZ)) {
      return 'too-large'
    }
  }

  // Clamp center position so the AABB fits within zone AABB with wall margin.
  const clampedX = Math.max(zoneMinX + halfExtentX + WALL_INSET, Math.min(zoneMaxX - halfExtentX - WALL_INSET, x))
  const clampedZ = Math.max(zoneMinZ + halfExtentZ + WALL_INSET, Math.min(zoneMaxZ - halfExtentZ - WALL_INSET, z))

  const newPos: [number, number, number] = [clampedX, y, clampedZ]

  // Verify all corners are now inside the zone polygon
  const newCorners = getItemCorners(newPos, dimensions, rotation)
  if (newCorners.every(([cx, cz]) => pointInPolygon(cx, cz, bestZone.polygon))) {
    return {
      position: newPos,
      reason: `Position adjusted to stay within room "${bestZone.name}".`,
    }
  }

  // Last resort: place at zone center
  const centerX = (zoneMinX + zoneMaxX) / 2
  const centerZ = (zoneMinZ + zoneMaxZ) / 2
  const centerPos: [number, number, number] = [centerX, y, centerZ]
  const centerCorners = getItemCorners(centerPos, dimensions, rotation)
  if (centerCorners.every(([cx, cz]) => pointInPolygon(cx, cz, bestZone.polygon))) {
    return {
      position: centerPos,
      reason: `Position adjusted to room center of "${bestZone.name}". Original position was outside room boundaries.`,
    }
  }

  // Cannot fit even at center — item is too large for this zone shape
  return 'too-large'
}

// ============================================================================
// Batch-Internal Item Collision Detection
// When AI places multiple items in one batch, earlier items are not yet in the
// spatial grid. This function checks for overlaps within the same batch.
// ============================================================================

/**
 * Check if a new item overlaps with any previously validated items in the same batch.
 * Uses rotated AABB overlap detection.
 *
 * @param position New item position
 * @param dimensions New item dimensions [w, h, d]
 * @param rotation New item rotation [rx, ry, rz]
 * @param batchItems Previously validated items in the same batch (position + dimensions + rotation)
 * @returns Push vector if overlap detected, null if no overlap, 'no-space' if unresolvable
 */
export function checkBatchItemCollision(
  position: [number, number, number],
  dimensions: [number, number, number],
  rotation: [number, number, number],
  batchItems: { position: [number, number, number]; dimensions: [number, number, number]; rotation: [number, number, number] }[],
): { position: [number, number, number]; reason: string } | 'no-space' | null {
  if (batchItems.length === 0) return null

  const itemAABB = getItemAABB(position, dimensions, rotation)
  let pushX = 0
  let pushZ = 0
  let hasCollision = false

  for (const other of batchItems) {
    const otherAABB = getItemAABB(other.position, other.dimensions, other.rotation)

    // Check AABB overlap
    const overlapX = Math.min(itemAABB.maxX, otherAABB.maxX) - Math.max(itemAABB.minX, otherAABB.minX)
    const overlapZ = Math.min(itemAABB.maxZ, otherAABB.maxZ) - Math.max(itemAABB.minZ, otherAABB.minZ)

    if (overlapX <= 0 || overlapZ <= 0) continue // No overlap

    hasCollision = true

    // Push along axis of minimum overlap (minimum separation vector)
    if (overlapX < overlapZ) {
      const dir = position[0] >= (otherAABB.minX + otherAABB.maxX) / 2 ? 1 : -1
      pushX += dir * (overlapX + 0.05) // 5cm extra clearance
    } else {
      const dir = position[2] >= (otherAABB.minZ + otherAABB.maxZ) / 2 ? 1 : -1
      pushZ += dir * (overlapZ + 0.05)
    }
  }

  if (!hasCollision) return null

  if (Math.abs(pushX) < 0.01 && Math.abs(pushZ) < 0.01) return null

  const newPos: [number, number, number] = [
    position[0] + pushX,
    position[1],
    position[2] + pushZ,
  ]

  // Verify pushed position doesn't still overlap
  const newAABB = getItemAABB(newPos, dimensions, rotation)
  for (const other of batchItems) {
    const otherAABB = getItemAABB(other.position, other.dimensions, other.rotation)
    const ox = Math.min(newAABB.maxX, otherAABB.maxX) - Math.max(newAABB.minX, otherAABB.minX)
    const oz = Math.min(newAABB.maxZ, otherAABB.maxZ) - Math.max(newAABB.minZ, otherAABB.minZ)
    if (ox > 0 && oz > 0) return 'no-space'
  }

  return {
    position: newPos,
    reason: 'Position adjusted to avoid overlapping with other items in the same batch.',
  }
}

/**
 * Detect if two wall segments cross THROUGH each other (not at endpoints).
 * Returns true only for genuine crossing — NOT for T-junctions where one
 * wall's endpoint touches the other wall's body.
 */

/**
 * Endpoint proximity tolerance — if a new wall's endpoint is within this
 * distance of the existing wall segment, treat it as a T-junction (allowed).
 */
const ENDPOINT_TOLERANCE = 0.3

export function wallsCrossThrough(
  a1: [number, number], a2: [number, number],
  b1: [number, number], b2: [number, number],
): boolean {
  // Pre-check: walls sharing endpoints are never crossings.
  // This handles T-junctions, extensions, and corners where one wall's
  // endpoint lands exactly on (or very near) the other wall's endpoint.
  const SHARED_ENDPOINT_EPS = 0.5 // same as grid snap tolerance
  for (const ep1 of [a1, a2]) {
    for (const ep2 of [b1, b2]) {
      if (Math.hypot(ep1[0] - ep2[0], ep1[1] - ep2[1]) < SHARED_ENDPOINT_EPS) {
        return false // shared endpoint = T-junction or extension, not crossing
      }
    }
  }

  // Standard segment intersection test using cross products
  const d1x = a2[0] - a1[0], d1z = a2[1] - a1[1]
  const d2x = b2[0] - b1[0], d2z = b2[1] - b1[1]

  const cross = d1x * d2z - d1z * d2x
  // Nearly parallel — handled by collinear overlap check
  if (Math.abs(cross) < 1e-6) return false

  const t = ((b1[0] - a1[0]) * d2z - (b1[1] - a1[1]) * d2x) / cross
  const u = ((b1[0] - a1[0]) * d1z - (b1[1] - a1[1]) * d1x) / cross

  // No intersection if parameters outside [0, 1]
  if (t < 0 || t > 1 || u < 0 || u > 1) return false

  // Intersection exists. Now check if it's at endpoints (T-junction = allowed).
  // If either segment's parameter is very close to 0 or 1, one wall's endpoint
  // is touching the other wall — this is a valid T-junction or corner.
  // Use a minimum absolute tolerance to avoid overly tight rejection on long walls.
  const aLen = Math.hypot(d1x, d1z)
  const bLen = Math.hypot(d2x, d2z)
  const ENDPOINT_T = Math.max(ENDPOINT_TOLERANCE / aLen, 0.05)
  const ENDPOINT_U = Math.max(ENDPOINT_TOLERANCE / bLen, 0.05)

  const aAtEndpoint = t < ENDPOINT_T || t > 1 - ENDPOINT_T
  const bAtEndpoint = u < ENDPOINT_U || u > 1 - ENDPOINT_U

  // If EITHER segment's intersection is at its endpoint, it's a T-junction → allowed
  if (aAtEndpoint || bAtEndpoint) return false

  // Both segments cross each other mid-body → genuine crossing → blocked
  return true
}

/**
 * Compute how much two wall segments overlap if they are nearly collinear.
 * Returns overlap length in meters, or 0 if not collinear or no overlap.
 */
export function computeCollinearOverlap(
  a1: [number, number], a2: [number, number],
  b1: [number, number], b2: [number, number],
): number {
  // Wall A direction
  const adx = a2[0] - a1[0]
  const adz = a2[1] - a1[1]
  const aLen = Math.hypot(adx, adz)
  if (aLen < 0.01) return 0

  // Wall B direction
  const bdx = b2[0] - b1[0]
  const bdz = b2[1] - b1[1]
  const bLen = Math.hypot(bdx, bdz)
  if (bLen < 0.01) return 0

  // Check collinearity: cross product should be ~0
  const cross = (adx / aLen) * (bdz / bLen) - (adz / aLen) * (bdx / bLen)
  if (Math.abs(cross) > 0.1) return 0 // Not collinear (>~6 degrees)

  // Check perpendicular distance between the two lines
  // Project b1 onto wall A's normal
  const nx = -adz / aLen
  const nz = adx / aLen
  const perpDist = Math.abs((b1[0] - a1[0]) * nx + (b1[1] - a1[1]) * nz)
  if (perpDist > 0.3) return 0 // Lines too far apart

  // Project all endpoints onto wall A's direction to find overlap
  const dax = adx / aLen
  const daz = adz / aLen
  const projA1 = 0
  const projA2 = aLen
  const projB1 = (b1[0] - a1[0]) * dax + (b1[1] - a1[1]) * daz
  const projB2 = (b2[0] - a1[0]) * dax + (b2[1] - a1[1]) * daz

  const aMin = Math.min(projA1, projA2)
  const aMax = Math.max(projA1, projA2)
  const bMin = Math.min(projB1, projB2)
  const bMax = Math.max(projB1, projB2)

  const overlapStart = Math.max(aMin, bMin)
  const overlapEnd = Math.min(aMax, bMax)

  return Math.max(0, overlapEnd - overlapStart)
}
