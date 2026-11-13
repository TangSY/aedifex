import { type AnyNode, type AnyNodeId, useScene } from '@aedifex/core'

type NodeUpdate = { id: AnyNodeId; data: Partial<AnyNode> }

export function createMepFollowerFrames(
  startNodes: Readonly<Record<string, AnyNode>>,
  movedId: AnyNodeId,
  watchedIds: readonly AnyNodeId[] = [],
) {
  const previous = new Map<AnyNodeId, Map<string, unknown>>()
  const expectedNodes = new Map([movedId, ...watchedIds].map((id) => [id, startNodes[id]]))
  const hasConflict = () => {
    const nodes = useScene.getState().nodes
    for (const [id, expected] of expectedNodes) if (nodes[id] !== expected) return true
    for (const [id, fields] of previous) {
      const current = nodes[id] as unknown as Record<string, unknown> | undefined
      if (!current) return true
      for (const [key, value] of fields) if (!Object.is(current[key], value)) return true
    }
    return false
  }
  const restore = (omittedOnly?: Map<AnyNodeId, Set<string>>) => {
    const nodes = useScene.getState().nodes
    const updates: NodeUpdate[] = []
    for (const [id, fields] of previous) {
      if (omittedOnly && id === movedId) continue
      const start = startNodes[id] as unknown as Record<string, unknown> | undefined
      const current = nodes[id] as unknown as Record<string, unknown> | undefined
      if (!start || !current) continue
      const keys = omittedOnly?.get(id)
      const eligible = [...fields].filter(
        ([key, lastValue]) => !keys?.has(key) && Object.is(current[key], lastValue),
      )
      if (eligible.length) {
        updates.push({
          id,
          data: Object.fromEntries(eligible.map(([key]) => [key, start[key]])) as Partial<AnyNode>,
        })
      }
    }
    return updates
  }
  const write = (updates: NodeUpdate[]) => {
    const nextKeys = new Map<AnyNodeId, Set<string>>()
    for (const update of updates) {
      const keys = nextKeys.get(update.id) ?? new Set<string>()
      for (const key of Object.keys(update.data)) keys.add(key)
      nextKeys.set(update.id, keys)
    }
    useScene.getState().updateNodes([...restore(nextKeys), ...updates])
    previous.clear()
    const nodes = useScene.getState().nodes
    for (const id of expectedNodes.keys()) expectedNodes.set(id, nodes[id])
    for (const [id, keys] of nextKeys) {
      const current = nodes[id] as unknown as Record<string, unknown> | undefined
      if (current) previous.set(id, new Map([...keys].map((key) => [key, current[key]])))
    }
  }
  return Object.assign(write, {
    hasConflict,
    restore() {
      const updates = restore()
      previous.clear()
      if (updates.length) useScene.getState().updateNodes(updates)
    },
  })
}
