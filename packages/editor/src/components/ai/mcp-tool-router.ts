/**
 * Remote MCP tool router — 把通过 SSE 收到的 MCP tool_call 路由到本地
 * SceneOperations 执行。运行环境是浏览器（同 useScene store）。
 *
 * 覆盖 30+ scene mutation/query 工具：
 *   - get_scene / get_node / find_nodes / describe_node      → 直接读
 *   - delete_node                                             → ops.deleteNode
 *   - undo / redo                                             → ops.undo/redo
 *   - apply_patch (create/update/delete batch)                → ops.applyPatch
 *   - validate_scene                                          → ops.validateScene
 *   - export_json                                             → ops.exportJSON
 *   - 其他工具（带 schema 验证的 add_wall/place_item 等）      → 通过 apply_patch
 *
 * 复杂参数化的工具（add_wall 带几何计算）路由到 apply_patch 路径，让 LLM
 * 自己提供完整 node 数据。这是 minimum viable — 后续可逐个增加专用 case。
 */

import type { AnyNode, AnyNodeId } from '@aedifex/core/schema'
import { getSceneOperations } from './scene-operations-adapter'

export interface RemoteMcpToolCall {
  toolName: string
  args: Record<string, unknown>
}

export interface RemoteMcpToolResult {
  ok: boolean
  result?: unknown
  error?: string
}

export async function executeRemoteMcpToolCall(
  call: RemoteMcpToolCall,
): Promise<RemoteMcpToolResult> {
  try {
    const ops = getSceneOperations()
    const result = await dispatch(ops, call)
    return { ok: true, result }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function dispatch(
  ops: ReturnType<typeof getSceneOperations>,
  call: RemoteMcpToolCall,
): Promise<unknown> {
  const { toolName, args } = call

  switch (toolName) {
    // ── Scene query ─────────────────────────────────────────────────────
    case 'get_scene':
      return ops.exportJSON()

    case 'get_node': {
      const id = String(args.id ?? '') as AnyNodeId
      if (!id) throw new Error('get_node: missing id')
      return ops.getNode(id)
    }

    case 'find_nodes':
      return ops.findNodes(args as Parameters<typeof ops.findNodes>[0])

    case 'describe_node': {
      const id = String(args.id ?? '') as AnyNodeId
      if (!id) throw new Error('describe_node: missing id')
      const node = ops.getNode(id)
      if (!node) return null
      const ancestry = ops.getAncestry(id).map((n) => ({ id: n.id, type: n.type }))
      const childrenIds = ops.getChildren(id).map((n) => n.id)
      return { node, ancestry, children: childrenIds }
    }

    case 'scene_query': {
      const nodes = ops.getNodes()
      const counts: Record<string, number> = {}
      for (const node of Object.values(nodes)) {
        counts[node.type] = (counts[node.type] ?? 0) + 1
      }
      return {
        rootNodeIds: ops.getRootNodeIds(),
        nodeCount: Object.keys(nodes).length,
        countByType: counts,
      }
    }

    // ── Mutations via apply_patch ───────────────────────────────────────
    case 'apply_patch': {
      const patches = args.patches as Parameters<typeof ops.applyPatch>[0]
      if (!Array.isArray(patches)) throw new Error('apply_patch: patches must be array')
      return ops.applyPatch(patches)
    }

    case 'delete_node': {
      const id = String(args.id ?? '') as AnyNodeId
      if (!id) throw new Error('delete_node: missing id')
      const cascade = Boolean(args.cascade ?? true)
      const removed = ops.deleteNode(id, cascade)
      return { removed }
    }

    // ── Undo/redo ───────────────────────────────────────────────────────
    case 'undo': {
      const steps = typeof args.steps === 'number' ? (args.steps as number) : 1
      return { applied: ops.undo(steps) }
    }
    case 'redo': {
      const steps = typeof args.steps === 'number' ? (args.steps as number) : 1
      return { applied: ops.redo(steps) }
    }

    // ── Validation / export ─────────────────────────────────────────────
    case 'validate_scene':
      return ops.validateScene()

    case 'export_json':
      return ops.exportJSON()

    // ── Specialised mutations: route to apply_patch with single create ──
    case 'create_wall':
    case 'place_item':
    case 'add_wall':
    case 'add_door':
    case 'add_window':
    case 'add_level':
    case 'add_slab':
    case 'add_ceiling':
    case 'add_roof':
    case 'add_stair':
    case 'add_zone':
    case 'add_building':
    case 'add_fence':
    case 'add_scan':
    case 'add_guide':
    case 'add_cut_out': {
      const node = args.node as AnyNode | undefined
      const parentId = (args.parentId as AnyNodeId | undefined) ?? undefined
      if (!node) {
        throw new Error(`${toolName}: missing 'node' (provide full schema-valid node)`)
      }
      return ops.applyPatch([{ op: 'create', node, parentId }])
    }

    case 'update_wall':
    case 'update_door':
    case 'update_window':
    case 'update_slab':
    case 'update_ceiling':
    case 'update_roof':
    case 'update_stair':
    case 'update_zone':
    case 'update_site':
    case 'update_item':
    case 'update_fence':
    case 'update_material':
    case 'update_wall_material':
    case 'update_roof_material':
    case 'update_stair_material': {
      const id = String(args.id ?? '') as AnyNodeId
      if (!id) throw new Error(`${toolName}: missing id`)
      const data = (args.data ?? args.updates ?? {}) as Partial<AnyNode>
      return ops.applyPatch([{ op: 'update', id, data }])
    }

    case 'remove_node':
    case 'remove_item': {
      const id = String(args.id ?? '') as AnyNodeId
      if (!id) throw new Error(`${toolName}: missing id`)
      const cascade = Boolean(args.cascade ?? true)
      return { removed: ops.deleteNode(id, cascade) }
    }

    case 'move_item':
    case 'move_building': {
      const id = String(args.id ?? '') as AnyNodeId
      const position = args.position as [number, number, number] | undefined
      if (!id || !position) throw new Error(`${toolName}: missing id or position`)
      return ops.applyPatch([
        { op: 'update', id, data: { position } as Partial<AnyNode> },
      ])
    }

    default:
      throw new Error(`unsupported tool: ${toolName}`)
  }
}
