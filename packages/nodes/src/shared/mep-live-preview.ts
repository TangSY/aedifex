import { type AnyNode, type AnyNodeId, useLiveNodeOverrides, useScene } from '@aedifex/core'

export function createMepLivePreview() {
  const ids = new Set<AnyNodeId>()
  return {
    publish(updates: { id: AnyNodeId; data: Partial<AnyNode> }[]) {
      const scene = useScene.getState()
      const overrides = useLiveNodeOverrides.getState()
      const entries = updates
        .filter((update) => scene.nodes[update.id])
        .map((update) => [update.id, update.data as Record<string, unknown>] as const)
      const nextIds = new Set(entries.map(([id]) => id))
      for (const id of ids) {
        if (nextIds.has(id)) continue
        overrides.clear(id)
        if (scene.nodes[id]) scene.markDirty(id)
        ids.delete(id)
      }
      overrides.setMany(entries)
      for (const [id] of entries) {
        ids.add(id)
        scene.markDirty(id)
      }
    },
    clear() {
      const scene = useScene.getState()
      const overrides = useLiveNodeOverrides.getState()
      for (const id of ids) {
        overrides.clear(id)
        if (scene.nodes[id]) scene.markDirty(id)
      }
      ids.clear()
    },
  }
}
