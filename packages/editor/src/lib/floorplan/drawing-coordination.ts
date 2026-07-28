import { type AnyNode, type ConstructionDrawingType, nodeRegistry } from '@aedifex/core'
import { getFloorplanNodeExtension } from './floorplan-extension'

export function resolveNodeForDrawingType(
  node: AnyNode,
  nodes: Record<string, AnyNode>,
  drawingType: ConstructionDrawingType,
): AnyNode | null {
  const extension = getFloorplanNodeExtension(nodeRegistry.get(node.type))
  return extension?.resolveForDrawing
    ? extension.resolveForDrawing({ node, nodes, drawingType })
    : node
}
