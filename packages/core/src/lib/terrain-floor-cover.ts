import type { AnyNode, AnyNodeId } from '../schema'
import { getLevelElevations, levelPlaneWorldY } from '../services/storey'
import { terrainFieldOverLevel } from './grade-standing'
import { groundOverPart } from './ground-over-part'
import { union } from './polygon-boolean'
import type { Point2D } from './polygon-union'
import { isSiteFlatwork } from './site-flatwork'
import { levelLocalToWorldXZ } from './terrain-support-query'

const TERRAIN_HEIGHT_EPSILON = 0.005

export function terrainFloorCover(nodes: Record<AnyNodeId, AnyNode>, siteId?: string): Point2D[][] {
  const elevations = getLevelElevations(nodes)
  const pieces: Point2D[][] = []
  const fallbackSite = Object.values(nodes).find((node) => node.type === 'site')
  for (const level of Object.values(nodes)) {
    if (level.type !== 'level' || level.visible === false) continue
    const buildingId = elevations.get(level.id)?.buildingId
    const building = buildingId ? nodes[buildingId as AnyNodeId] : undefined
    if (building?.type === 'building' && building.visible === false) continue
    const actualSite =
      (building?.parentId ? nodes[building.parentId as AnyNodeId] : undefined) ?? fallbackSite
    if (siteId && actualSite?.id !== siteId) continue
    const terrain = terrainFieldOverLevel(nodes, level)
    const floorY = levelPlaneWorldY(nodes, level.id)
    if (!terrain || floorY === null) continue
    const placement = building?.type === 'building' ? building : null
    for (const childId of level.children) {
      const slab = nodes[childId as AnyNodeId]
      if (slab?.type !== 'slab' || slab.visible === false || slab.recessed || isSiteFlatwork(slab))
        continue
      const footprint = slab.polygon.map(([x, z]) => levelLocalToWorldXZ(placement, x, z))
      pieces.push(
        ...groundOverPart(footprint, terrain, floorY + slab.elevation + TERRAIN_HEIGHT_EPSILON),
      )
    }
  }
  return union(pieces)
    .filter((part) => part.holes.length === 0)
    .map((part) => part.outer)
}
