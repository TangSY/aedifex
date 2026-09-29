import { type DesignPlacementRequest, planDesignPlacement } from '@aedifex/core/procedural-items'
import type { AnyNode, AnyNodeId } from '@aedifex/core/schema'
import type { Patch } from '../bridge/scene-bridge'
import type { SceneOperations } from './scene-operations'

export function placeDesign({
  operations,
  request,
}: {
  operations: SceneOperations
  request: DesignPlacementRequest
}) {
  const { node, parentId, hostUpdate } = planDesignPlacement(operations.getNodes(), request)
  const patches: Patch[] = [
    { op: 'create', node: node as AnyNode, parentId: parentId as AnyNodeId },
    ...(hostUpdate
      ? [{
          op: 'update' as const,
          id: hostUpdate.id as AnyNodeId,
          data: { attachments: hostUpdate.attachments } as Partial<AnyNode>,
        }]
      : []),
  ]
  operations.applyPatch(patches)
  return { designId: node.id, parentId, surfaceId: request.surfaceId ?? null }
}
