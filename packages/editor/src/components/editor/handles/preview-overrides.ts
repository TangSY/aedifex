import type { AnyNode, AnyNodeId } from '@aedifex/core'

export function replacePreviewOverrideIds(
  activeIds: ReadonlySet<AnyNodeId>,
  entries: ReadonlyArray<readonly [AnyNodeId, Partial<AnyNode>]>,
  clear: (id: AnyNodeId) => void,
): Set<AnyNodeId> {
  const nextIds = new Set(entries.map(([id]) => id))
  for (const id of activeIds) {
    if (!nextIds.has(id)) clear(id)
  }
  return nextIds
}
