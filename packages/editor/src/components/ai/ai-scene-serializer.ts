import type { AnyNode, AnyNodeId } from '@pascal-app/core'
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
      wallCount: 0,
      zoneCount: 0,
    }
  }

  const items: SceneItemSummary[] = []
  let wallCount = 0
  let zoneCount = 0
  let activeZone: SceneContext['activeZone'] | undefined

  // Collect all nodes belonging to this level
  const levelNode = nodes[levelId]
  if (!levelNode || !('children' in levelNode)) {
    return { levelId, items: [], wallCount: 0, zoneCount: 0 }
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
      case 'wall':
        wallCount++
        break
      case 'zone': {
        zoneCount++
        // Use the selected zone if available
        if (selection.nodeId === node.id || selection.path?.includes(node.id)) {
          activeZone = {
            id: node.id,
            name: node.name ?? 'Zone',
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
    wallCount,
    zoneCount,
    activeZone,
  }
}

/**
 * Format scene context as a string for the Claude system prompt.
 */
export function formatSceneContextForPrompt(ctx: SceneContext): string {
  const lines: string[] = [
    `Current scene (level: ${ctx.levelId}):`,
    `- ${ctx.wallCount} walls, ${ctx.zoneCount} zones`,
    `- ${ctx.items.length} items:`,
  ]

  if (ctx.activeZone) {
    lines.splice(1, 0, `- Active zone: "${ctx.activeZone.name}" (${ctx.activeZone.id})`)
  }

  for (const item of ctx.items) {
    const pos = item.position.map((v) => v.toFixed(2)).join(', ')
    lines.push(`  [${item.id}] ${item.name} (${item.catalogSlug}) at (${pos}) rot=${item.rotationY.toFixed(2)}`)
  }

  if (ctx.items.length === 0) {
    lines.push('  (empty — no items placed yet)')
  }

  return lines.join('\n')
}
