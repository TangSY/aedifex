import type { PlacementOption } from './types'

export function buildPlacementOptionMessage(option: PlacementOption): string {
  const [x, y, z] = option.position
  return `Apply placement option "${option.id}" using a single add_item call: catalogSlug="${option.catalogSlug}", position=[${x}, ${y}, ${z}], rotationY=${option.rotationY}. Do NOT remove, move, or modify any existing items in the scene — only add this one item.`
}
