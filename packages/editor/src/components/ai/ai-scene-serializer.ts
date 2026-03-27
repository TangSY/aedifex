import type { AnyNode, AnyNodeId, DoorNode, WallNode, WindowNode, ZoneNode } from '@pascal-app/core'
import { useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import type { SceneContext, SceneItemSummary } from './types'

/**
 * Serialize the current scene state into a compact context object for Claude.
 * Only includes the active level's items + zone info.
 * Target: < 4000 tokens for the serialized context.
 */
export function serializeSceneContext(): SceneContext {
  const { nodes } = useScene.getState()
  const { selection } = useViewer.getState()
  const levelId = selection.levelId

  if (!levelId) {
    return {
      levelId: '',
      items: [],
      walls: [],
      zones: [],
      wallCount: 0,
      zoneCount: 0,
    }
  }

  const items: SceneItemSummary[] = []
  const walls: SceneContext['walls'] = []
  const zones: SceneContext['zones'] = []
  let wallCount = 0
  let zoneCount = 0
  let activeZone: SceneContext['activeZone'] | undefined

  // Collect all nodes belonging to this level
  const levelNode = nodes[levelId]
  if (!levelNode || !('children' in levelNode)) {
    return { levelId, items: [], walls: [], zones: [], wallCount: 0, zoneCount: 0 }
  }

  // Walk through all nodes to find items, walls, and zones on this level
  const visited = new Set<string>()
  const queue: AnyNodeId[] = [levelId]

  while (queue.length > 0) {
    const nodeId = queue.shift()!
    if (visited.has(nodeId)) continue
    visited.add(nodeId)

    const node = nodes[nodeId]
    if (!node) continue

    switch (node.type) {
      case 'item': {
        items.push({
          id: node.id,
          name: node.name ?? node.asset.name,
          catalogSlug: node.asset.id,
          position: [...node.position] as [number, number, number],
          rotationY: node.rotation[1],
          dimensions: [...node.asset.dimensions] as [number, number, number],
          category: node.asset.category,
        })
        break
      }
      case 'wall': {
        wallCount++
        const wallNode = node as WallNode
        // Compute wall length for context
        const wdx = wallNode.end[0] - wallNode.start[0]
        const wdz = wallNode.end[1] - wallNode.start[1]
        const wallLen = Math.hypot(wdx, wdz)

        // Collect wall children (doors/windows)
        const wallChildren: { type: string; id: string; localX: number; width: number }[] = []
        if (wallNode.children) {
          for (const childId of wallNode.children) {
            const child = nodes[childId as AnyNodeId]
            if (!child) continue
            if (child.type === 'door') {
              const door = child as DoorNode
              wallChildren.push({
                type: 'door',
                id: door.id,
                localX: door.position[0],
                width: door.width,
              })
            } else if (child.type === 'window') {
              const win = child as WindowNode
              wallChildren.push({
                type: 'window',
                id: win.id,
                localX: win.position[0],
                width: win.width,
              })
            }
          }
        }

        walls.push({
          id: wallNode.id,
          start: [...wallNode.start] as [number, number],
          end: [...wallNode.end] as [number, number],
          thickness: wallNode.thickness ?? 0.2,
          length: wallLen,
          children: wallChildren,
        })
        break
      }
      case 'zone': {
        zoneCount++
        const zoneNode = node as ZoneNode
        const polygon = zoneNode.polygon as [number, number][]

        // Compute AABB bounds from polygon
        const xs = polygon.map((p) => p[0])
        const zs = polygon.map((p) => p[1])
        const zoneBounds = {
          min: [Math.min(...xs), Math.min(...zs)] as [number, number],
          max: [Math.max(...xs), Math.max(...zs)] as [number, number],
        }

        zones.push({
          id: zoneNode.id,
          name: zoneNode.name ?? 'Zone',
          polygon,
          bounds: zoneBounds,
        })

        // Use the selected zone if available
        if (selection.zoneId === node.id || selection.selectedIds?.includes(node.id)) {
          activeZone = {
            id: node.id,
            name: zoneNode.name ?? 'Zone',
            bounds: zoneBounds,
          }
        }
        break
      }
    }

    // Traverse children
    if ('children' in node && Array.isArray(node.children)) {
      for (const childId of node.children) {
        queue.push(childId as AnyNodeId)
      }
    }
  }

  // Also traverse walls' children (items attached to walls)
  for (const nodeEntry of Object.values(nodes)) {
    const n = nodeEntry as AnyNode
    if (n.type === 'item' && n.parentId && !visited.has(n.id)) {
      const parent = nodes[n.parentId as AnyNodeId]
      if (parent?.type === 'wall') {
        // Check if this wall belongs to our level
        const wallParent = nodes[parent.parentId as AnyNodeId]
        if (wallParent && visited.has(wallParent.id)) {
          items.push({
            id: n.id,
            name: n.name ?? n.asset.name,
            catalogSlug: n.asset.id,
            position: [...n.position] as [number, number, number],
            rotationY: n.rotation[1],
            dimensions: [...n.asset.dimensions] as [number, number, number],
            category: n.asset.category,
          })
        }
      }
    }
  }

  return {
    levelId,
    items,
    walls,
    zones,
    wallCount,
    zoneCount,
    activeZone,
  }
}

/**
 * Format scene context as a string for the AI system prompt.
 * Includes spatial geometry (zone boundaries, wall positions) so AI can make
 * reasonable placement decisions.
 * Enhanced with semantic spatial descriptions (wall directions, room shape,
 * available areas) to help LLM reason about space more effectively.
 */
export function formatSceneContextForPrompt(ctx: SceneContext): string {
  const lines: string[] = [
    `Current scene (level: ${ctx.levelId}):`,
    `- ${ctx.wallCount} walls, ${ctx.zoneCount} zones`,
  ]

  // Zone spatial data with semantic descriptions
  if (ctx.zones.length > 0) {
    lines.push('- Zones:')
    for (const zone of ctx.zones) {
      const sizeX = zone.bounds.max[0] - zone.bounds.min[0]
      const sizeZ = zone.bounds.max[1] - zone.bounds.min[1]
      const area = sizeX * sizeZ
      const shape = Math.abs(sizeX - sizeZ) < 0.5
        ? 'square'
        : sizeX > sizeZ ? 'wide (X-axis longer)' : 'deep (Z-axis longer)'

      lines.push(`  "${zone.name}" (${zone.id}):`)
      lines.push(`    Size: ${sizeX.toFixed(2)}m × ${sizeZ.toFixed(2)}m (${area.toFixed(1)}m²), Shape: ${shape}`)
      lines.push(`    Bounds: min=(${zone.bounds.min[0].toFixed(2)}, ${zone.bounds.min[1].toFixed(2)}) max=(${zone.bounds.max[0].toFixed(2)}, ${zone.bounds.max[1].toFixed(2)})`)
      lines.push(`    Center: (${((zone.bounds.min[0] + zone.bounds.max[0]) / 2).toFixed(2)}, ${((zone.bounds.min[1] + zone.bounds.max[1]) / 2).toFixed(2)})`)
    }
  }

  // Wall positions with semantic descriptions (direction, length, orientation)
  if (ctx.walls.length > 0) {
    lines.push('- Walls (with semantic info):')

    // 分析墙体并添加语义标注
    const wallInfos = ctx.walls.map((wall) => {
      const dx = wall.end[0] - wall.start[0]
      const dz = wall.end[1] - wall.start[1]
      const length = Math.hypot(dx, dz)
      const angle = Math.atan2(dz, dx)

      // 判断墙体朝向
      let orientation: string
      const absDx = Math.abs(dx)
      const absDz = Math.abs(dz)
      if (absDx > absDz * 3) {
        orientation = 'horizontal (along X-axis)'
      } else if (absDz > absDx * 3) {
        orientation = 'vertical (along Z-axis)'
      } else {
        orientation = `diagonal (${(angle * 180 / Math.PI).toFixed(0)}°)`
      }

      // 计算墙面内侧法线方向
      const normalX = -dz / length
      const normalZ = dx / length

      return { wall, length, orientation, normalX, normalZ, dx, dz }
    })

    // 找出最长墙
    const longestWall = wallInfos.reduce((a, b) => a.length > b.length ? a : b)

    for (const info of wallInfos) {
      const { wall, length, orientation } = info
      const isLongest = info === longestWall ? ' [LONGEST]' : ''
      lines.push(`  [${wall.id}] (${wall.start[0].toFixed(2)}, ${wall.start[1].toFixed(2)}) → (${wall.end[0].toFixed(2)}, ${wall.end[1].toFixed(2)}) length=${length.toFixed(2)}m ${orientation}${isLongest}`)

      // Show doors/windows on this wall
      if (wall.children && wall.children.length > 0) {
        for (const child of wall.children) {
          lines.push(`    └─ ${child.type} [${child.id}] at localX=${child.localX.toFixed(2)}m width=${child.width.toFixed(2)}m`)
        }
      }
    }

    // 额外的墙体总结
    lines.push(`  Summary: longest wall is ${longestWall.length.toFixed(2)}m (${longestWall.orientation})`)
  }

  if (ctx.activeZone) {
    lines.push(`- Active zone: "${ctx.activeZone.name}" (${ctx.activeZone.id})`)
    if (ctx.activeZone.bounds) {
      lines.push(`  Bounds: min=(${ctx.activeZone.bounds.min[0].toFixed(2)}, ${ctx.activeZone.bounds.min[1].toFixed(2)}) max=(${ctx.activeZone.bounds.max[0].toFixed(2)}, ${ctx.activeZone.bounds.max[1].toFixed(2)})`)
    }
  }

  // Existing items with grouping info
  lines.push(`- ${ctx.items.length} items:`)
  if (ctx.items.length === 0) {
    lines.push('  (empty — no items placed yet)')
  } else {
    for (const item of ctx.items) {
      const pos = item.position.map((v) => v.toFixed(2)).join(', ')
      const dim = item.dimensions.map((v) => v.toFixed(2)).join('×')
      lines.push(`  [${item.id}] ${item.name} (${item.catalogSlug}) at (${pos}) rot=${item.rotationY.toFixed(2)} size=${dim}m`)
    }

    // 空闲区域分析（简化：基于 zone bounds 和已有物品位置）
    if (ctx.zones.length > 0) {
      lines.push('- Available areas (approximate, avoiding existing items):')
      for (const zone of ctx.zones) {
        const occupied = ctx.items.map((item) => ({
          cx: item.position[0],
          cz: item.position[2],
          hw: item.dimensions[0] / 2,
          hd: item.dimensions[2] / 2,
        }))

        // 将 zone 分为 4 象限，标注每个象限的占用情况
        const midX = (zone.bounds.min[0] + zone.bounds.max[0]) / 2
        const midZ = (zone.bounds.min[1] + zone.bounds.max[1]) / 2
        const quadrants = [
          { name: 'top-left (min X, min Z)', minX: zone.bounds.min[0], maxX: midX, minZ: zone.bounds.min[1], maxZ: midZ },
          { name: 'top-right (max X, min Z)', minX: midX, maxX: zone.bounds.max[0], minZ: zone.bounds.min[1], maxZ: midZ },
          { name: 'bottom-left (min X, max Z)', minX: zone.bounds.min[0], maxX: midX, minZ: midZ, maxZ: zone.bounds.max[1] },
          { name: 'bottom-right (max X, max Z)', minX: midX, maxX: zone.bounds.max[0], minZ: midZ, maxZ: zone.bounds.max[1] },
        ]

        for (const q of quadrants) {
          const itemsInQuadrant = occupied.filter(
            (o) => o.cx >= q.minX && o.cx <= q.maxX && o.cz >= q.minZ && o.cz <= q.maxZ,
          )
          const status = itemsInQuadrant.length === 0
            ? 'EMPTY (available)'
            : `${itemsInQuadrant.length} items`
          lines.push(`    ${q.name}: ${status}`)
        }
      }
    }
  }

  return lines.join('\n')
}
