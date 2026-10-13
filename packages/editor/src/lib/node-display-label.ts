import { type AnyNode, nodeRegistry } from '@aedifex/core'

/**
 * A node's human label, the same in the baked artifact (`extras.label`) and the
 * viewer's breadcrumb: an explicit name wins, items fall back to their catalog
 * asset name, other kinds to the registered presentation label.
 */
export function nodeDisplayLabel(node: AnyNode): string {
  if (node.name) return node.name
  if (node.type === 'item' && node.asset?.name) return node.asset.name
  return nodeRegistry.get(node.type)?.presentation?.label ||
    node.type.replace(/(^|-)(\w)/g, (_match, separator: string, letter: string) =>
      separator ? ` ${letter}` : letter.toUpperCase())
}
