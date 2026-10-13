/** Check after scene click listeners have finished updating selection. */
export function shouldRecallWorkspaceForSelection(
  nodeId: string,
  selectedIds: readonly string[],
  mode: string,
  scope: string,
) {
  return mode === 'select' && scope === 'idle' && selectedIds.includes(nodeId)
}
