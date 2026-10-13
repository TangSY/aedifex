export type SettingsHierarchyNode = {
  id: string
  type: string
  parentId?: string | null
  children?: readonly string[]
  gutterId?: string | null
  dormerId?: string | null
  wallId?: string | null
  roofSegmentId?: string | null
}

export function resolveSettingsHierarchy<T extends SettingsHierarchyNode>(node: SettingsHierarchyNode, nodes: Readonly<Record<string, T | undefined>>) {
  const parent = nodes[node.gutterId ?? node.dormerId ?? node.roofSegmentId ?? node.wallId ?? node.parentId ?? '']
  const directIds = new Set(node.children ?? [])
  const children = Object.values(nodes).filter((child): child is T => !!child && child.id !== node.id && (
    directIds.has(child.id) ||
    (child.gutterId ?? child.dormerId ?? child.roofSegmentId ?? child.wallId ?? child.parentId) === node.id
  ))
  return {
    parent: parent && parent.id !== node.id && !['site', 'building', 'level'].includes(parent.type) ? parent : undefined,
    children,
  }
}
