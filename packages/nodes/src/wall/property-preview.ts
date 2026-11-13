import {
  type AnyNode,
  type AnyNodeId,
  getWallPlaneTop,
  resolveWallTopPlane,
  useLiveNodeOverrides,
  useScene,
  type WallNode,
  wallSupportForNodes,
  wallTopContext,
} from '@aedifex/core'
import { resolveWallOpeningCeiling } from '../shared/wall-opening-ceiling'

export function wallSlopeEditPatch({
  wall,
  nodes,
  offset,
}: {
  wall: WallNode
  nodes: Record<AnyNodeId, AnyNode>
  offset: number
}): Partial<WallNode> {
  if (!wall.topProfile) return { endHeightOffset: offset }
  const base = wallSupportForNodes(wall, nodes).elevation
  const levelId = wall.parentId ?? ''
  const storeyHeight = getWallPlaneTop(wall, levelId, nodes)
  const context = wallTopContext({ wall, levelId, nodes, electedBase: base, storeyHeight })
  const rawEnd = resolveWallTopPlane({ wall, ...context, t: 1 })
  const start = resolveWallOpeningCeiling(wall, nodes, 0) + base
  return {
    endHeightOffset: offset,
    topProfile: {
      ...wall.topProfile,
      endShift: (wall.topProfile.endShift ?? 0) + start + offset - rawEnd,
    },
  }
}

export function createWallPropertyPreview(id: AnyNodeId) {
  let pending: Partial<WallNode> | undefined
  const clear = () => {
    if (!pending) return
    useLiveNodeOverrides.getState().clearFields(id, Object.keys(pending))
    pending = undefined
    useScene.getState().markDirty(id)
  }
  return {
    preview(patch: Partial<WallNode>) {
      pending = { ...pending, ...patch }
      useLiveNodeOverrides.getState().set(id, patch)
      useScene.getState().markDirty(id)
    },
    commit(patch?: Partial<WallNode>) {
      const live = useLiveNodeOverrides.getState().get(id)
      const current =
        pending && live
          ? Object.fromEntries(
              Object.keys(pending)
                .filter((key) => key in live)
                .map((key) => [key, live[key]]),
            )
          : undefined
      const updates = { ...current, ...patch }
      if (Object.keys(updates).length && useScene.getState().nodes[id]?.type === 'wall')
        useScene.getState().updateNode(id, updates)
      clear()
    },
    cancel: clear,
  }
}
