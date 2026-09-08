/**
 * SceneOperations adapter — 桥接 @aedifex/mcp 的标准抽象到自家 AI 模块
 *
 * 作用：让 ai-mutation-executor 可逐步迁移到 SceneOperations 接口。
 * - SceneBridge 直接操作 Zustand store（与编辑器共享 undo/redo）
 * - 浏览器场景下不传入 store（SaaS 用自己的持久化）
 * - 保留 ghost preview / proposal UI 不变
 *
 * 用法示例（迁移后）：
 *   const ops = getSceneOperations()
 *   const id = ops.createNode(wallNode, levelId)
 *   ops.updateNode(id, { length: 5000 })
 *   ops.applyPatch([{ op: 'create', node: ... }])
 */

import { createSceneOperations, type SceneOperations } from '@aedifex/mcp/operations'
import { SceneBridge } from '@aedifex/mcp/bridge'

let _ops: SceneOperations | null = null

/** 单例 SceneOperations，懒初始化，复用编辑器 useScene store。 */
export function getSceneOperations(): SceneOperations {
  if (_ops) return _ops
  const bridge = new SceneBridge()
  _ops = createSceneOperations({ bridge })
  return _ops
}

/** 测试场景下重置（避免跨用例污染）。 */
export function resetSceneOperationsForTesting(): void {
  _ops = null
}

export type { SceneOperations }
