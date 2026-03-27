import type { WallNode } from '@aedifex/core'
import { useScene } from '@aedifex/core'
import type { ValidatedAddItem, ValidatedMoveItem, ValidatedOperation } from './types'

// ============================================================================
// Layout Optimizer
// 对 AI 生成的放置操作进行后验优化：墙体对齐、功能分组间距、通道保障、对称修正。
// 在 mutation executor 验证后、ghost preview 之前执行。
// ============================================================================

/** 墙体对齐吸附阈值（米） */
const WALL_SNAP_THRESHOLD = 0.3
/** 物品到墙面的标准间距（米），贴墙放置时使用 */
const WALL_OFFSET = 0.05
/** 最小通道宽度（米） */
const MIN_WALKWAY = 0.6

// ============================================================================
// 功能分组间距规则
// ============================================================================

interface SpacingRule {
  /** 主物品的 category 或 catalogSlug 关键字 */
  primary: string[]
  /** 伴随物品的 category 或 catalogSlug 关键字 */
  companion: string[]
  /** 理想间距（米） */
  idealDistance: number
  /** 允许偏差（米） */
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
// 靠墙家具类别
// ============================================================================

const AGAINST_WALL_CATEGORIES = [
  'sofa', 'couch', 'bookshelf', 'bookcase', 'tv-stand', 'tv-cabinet',
  'desk', 'bed', 'wardrobe', 'cabinet', 'sideboard', 'console',
  'shelf', 'dresser',
]

// ============================================================================
// Public API
// ============================================================================

/**
 * 对一组已验证的操作进行布局优化。
 * 仅调整 add_item 和 move_item 类型的有效/调整后操作。
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
// 单项优化
// ============================================================================

function optimizeAddItem(
  op: ValidatedAddItem,
  allOps: ValidatedOperation[],
): ValidatedAddItem {
  if (op.status === 'invalid' || !op.asset) return op

  let position = [...op.position] as [number, number, number]
  let rotation = [...op.rotation] as [number, number, number]
  const reasons: string[] = []

  // 1. 靠墙家具 → 墙体对齐吸附
  if (isAgainstWallItem(op.asset.id, op.asset.category)) {
    const wallSnap = snapToNearestWall(
      position,
      [op.asset.dimensions?.[0] ?? 1, op.asset.dimensions?.[1] ?? 1, op.asset.dimensions?.[2] ?? 1],
      rotation,
    )
    if (wallSnap) {
      position = wallSnap.position
      rotation = wallSnap.rotation
      reasons.push('对齐到最近墙面')
    }
  }

  // 2. 功能分组间距检查（与同批次其他物品的关系）
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
  allOps: ValidatedOperation[],
): ValidatedMoveItem {
  if (op.status === 'invalid') return op

  // move_item 优化相对保守 — 仅做墙体吸附
  const { nodes } = useScene.getState()
  const node = nodes[op.nodeId]
  if (!node || node.type !== 'item') return op

  let position = [...op.position] as [number, number, number]
  let rotation = [...op.rotation] as [number, number, number]
  const reasons: string[] = []

  if (isAgainstWallItem(node.asset.id, node.asset.category)) {
    const wallSnap = snapToNearestWall(position, node.asset.dimensions, rotation)
    if (wallSnap) {
      position = wallSnap.position
      rotation = wallSnap.rotation
      reasons.push('对齐到最近墙面')
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
// 墙体对齐吸附
// ============================================================================

function snapToNearestWall(
  position: [number, number, number],
  dimensions: [number, number, number],
  rotation: [number, number, number],
): { position: [number, number, number]; rotation: [number, number, number] } | null {
  const walls = getAllWalls()
  if (walls.length === 0) return null

  const [px, py, pz] = position
  let bestWall: WallNode | null = null
  let bestDist = WALL_SNAP_THRESHOLD
  let bestClosestPoint: [number, number] = [0, 0]

  for (const wall of walls) {
    // 计算物品中心到墙段的最近距离
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

  // 计算墙体法线方向
  const wallDx = bestWall.end[0] - bestWall.start[0]
  const wallDz = bestWall.end[1] - bestWall.start[1]
  const wallLen = Math.hypot(wallDx, wallDz)
  if (wallLen < 0.01) return null

  // 法线 = 墙体方向旋转 90 度
  const normalX = -wallDz / wallLen
  const normalZ = wallDx / wallLen

  // 判断物品应在法线的哪一侧（选择物品当前所在的一侧）
  const toCenterX = px - bestClosestPoint[0]
  const toCenterZ = pz - bestClosestPoint[1]
  const side = Math.sign(toCenterX * normalX + toCenterZ * normalZ) || 1

  // 计算物品的半深度（沿法线方向的尺寸）
  const [w, , d] = dimensions
  const wallAngle = Math.atan2(wallDz, wallDx)
  const itemAngle = rotation[1]
  const angleDiff = Math.abs(normalizeAngle(itemAngle - wallAngle))
  // 根据物品朝向，选择 w 或 d 作为深度
  const halfDepth = (angleDiff < Math.PI / 4 || angleDiff > (3 * Math.PI) / 4)
    ? d / 2
    : w / 2

  const thickness = bestWall.thickness ?? 0.2
  const offset = thickness / 2 + halfDepth + WALL_OFFSET

  // 新位置：沿最近点向法线方向偏移
  const newX = bestClosestPoint[0] + normalX * side * offset
  const newZ = bestClosestPoint[1] + normalZ * side * offset

  // 计算物品朝向：面向法线方向（面向房间内部）
  const faceAngle = Math.atan2(side * normalX, side * normalZ)

  return {
    position: [newX, py, newZ],
    rotation: [0, faceAngle, 0],
  }
}

// ============================================================================
// 功能分组间距
// ============================================================================

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
    // 检查当前物品是否是 companion
    const isCompanion = rule.companion.some((k) => slug.includes(k) || cat.includes(k))
    if (!isCompanion) continue

    // 在同批次操作中找 primary 物品
    for (const op of allOps) {
      if (op.type !== 'add_item' || op.status === 'invalid' || !op.asset) continue
      const opSlug = op.asset.id.toLowerCase()
      const opCat = op.asset.category.toLowerCase()
      const isPrimary = rule.primary.some((k) => opSlug.includes(k) || opCat.includes(k))
      if (!isPrimary) continue

      // 计算当前间距
      const dx = position[0] - op.position[0]
      const dz = position[2] - op.position[2]
      const currentDist = Math.hypot(dx, dz)
      const diff = currentDist - rule.idealDistance

      if (Math.abs(diff) <= rule.tolerance) continue

      // 需要调整：沿当前方向缩放到理想距离
      if (currentDist < 0.01) continue // 重合时不处理

      const scale = rule.idealDistance / currentDist
      const newX = op.position[0] + dx * scale
      const newZ = op.position[2] + dz * scale

      return {
        position: [newX, position[1], newZ],
        reason: `调整与${rule.primary[0]}的间距至${rule.idealDistance}m`,
      }
    }
  }

  return null
}

// ============================================================================
// 工具函数
// ============================================================================

function isAgainstWallItem(assetId: string, category: string): boolean {
  const slug = assetId.toLowerCase()
  const cat = category.toLowerCase()
  return AGAINST_WALL_CATEGORIES.some((k) => slug.includes(k) || cat.includes(k))
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

/** 将角度归一化到 [-PI, PI] */
function normalizeAngle(angle: number): number {
  while (angle > Math.PI) angle -= 2 * Math.PI
  while (angle < -Math.PI) angle += 2 * Math.PI
  return angle
}
