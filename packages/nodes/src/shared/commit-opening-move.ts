import { type AnyNodeId, type DoorNode, useScene, type WindowNode } from '@aedifex/core'
import { isMetadataRecord } from './node-metadata'

/** A move changes placement, not persistent ownership (Array, assets, etc.). */
export function commitOpeningMove(id: AnyNodeId, patch: Partial<DoorNode | WindowNode>) {
  const node = useScene.getState().nodes[id]
  if (!node || (node.type !== 'window' && node.type !== 'door')) return
  if (isMetadataRecord(node.metadata)) {
    const { isNew: _new, isTransient: _transient, ...metadata } = node.metadata
    useScene.getState().updateNode(id, { ...patch, metadata })
  } else {
    useScene.getState().updateNode(id, { ...patch, metadata: node.metadata })
  }
}
