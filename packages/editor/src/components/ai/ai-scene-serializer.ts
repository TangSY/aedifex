import type { AnyNode, AnyNodeId, CeilingNode, DoorNode, SlabNode, WallNode, WindowNode, ZoneNode } from '@aedifex/core'
import { useScene } from '@aedifex/core'
import { useViewer } from '@aedifex/viewer'
import { useAIChat } from './ai-chat-store'
import { polygonArea } from './mutation/validate-structure'
import { analyzeRoom, formatRoomAnalysis } from './room-analyzer'
import type { SceneContext, SceneCeilingSummary, SceneFenceSummary, SceneLevelSummary, SceneRoofSummary, SceneSlabSummary, SceneStairSummary, SceneItemSummary } from './types'

// ============================================================================
// Scene Context Cache
// Encapsulates cache state to avoid module-level mutable variables.
// ============================================================================

class SceneContextCache {
  private context: SceneContext | null = null
  private nodesHash = ''

  /** Compute a content hash from node IDs to detect additions/deletions/swaps */
  private computeHash(nodes: Record<string, unknown>): string {
    const ids = Object.keys(nodes).sort()
    return `${ids.length}:${ids.join(',')}`
  }

  /** Get cached context if the scene hasn't changed */
  get(nodes: Record<string, unknown>, levelId: string): SceneContext | null {
    const hash = this.computeHash(nodes)
    if (this.context && this.nodesHash === hash && this.context.levelId === levelId) {
      return this.context
    }
    return null
  }

  /** Update cached context */
  set(context: SceneContext, nodes: Record<string, unknown>): void {
    this.context = context
    this.nodesHash = this.computeHash(nodes)
  }

  /** Invalidate the cache */
  invalidate(): void {
    this.context = null
    this.nodesHash = ''
  }
}

const sceneContextCache = new SceneContextCache()

// ============================================================================
// Per-Node-Type Serializers
// Extracted from serializeSceneContext for readability and testability.
// ============================================================================

function serializeItemNode(
  node: AnyNode & { asset: { name: string; id: string; dimensions: [number, number, number]; category: string }; position: [number, number, number]; rotation: [number, number, number]; name?: string },
  items: SceneItemSummary[],
): void {
  items.push({
    id: node.id,
    name: node.name ?? node.asset.name,
    catalogSlug: node.asset.id,
    position: [...node.position] as [number, number, number],
    rotationY: node.rotation[1],
    dimensions: [...node.asset.dimensions] as [number, number, number],
    category: node.asset.category,
  })
}

function serializeWallNode(
  wallNode: WallNode,
  nodes: Record<string, AnyNode>,
  walls: SceneContext['walls'],
  items: SceneItemSummary[],
  visited: Set<string>,
): void {
  const wdx = wallNode.end[0] - wallNode.start[0]
  const wdz = wallNode.end[1] - wallNode.start[1]
  const wallLen = Math.hypot(wdx, wdz)

  const wallChildren: { type: string; id: string; localX: number; width: number }[] = []
  if (wallNode.children) {
    for (const childId of wallNode.children) {
      const child = nodes[childId as AnyNodeId]
      if (!child) continue
      if (child.type === 'door') {
        const door = child as DoorNode
        wallChildren.push({ type: 'door', id: door.id, localX: door.position[0], width: door.width })
      } else if (child.type === 'window') {
        const win = child as WindowNode
        wallChildren.push({ type: 'window', id: win.id, localX: win.position[0], width: win.width })
      } else if (child.type === 'item') {
        const wallItem = child as AnyNode & { asset: { name: string; id: string; dimensions: [number, number, number]; category: string }; position: [number, number, number]; rotation: [number, number, number]; name?: string }
        serializeItemNode(wallItem, items)
        visited.add(wallItem.id)
      }
    }
  }

  const wallWithSurface = wallNode as WallNode & {
    interiorMaterial?: unknown
    interiorMaterialPreset?: string
    exteriorMaterial?: unknown
    exteriorMaterialPreset?: string
    material?: unknown
    materialPreset?: string
  }
  const hasWallMaterial =
    wallWithSurface.interiorMaterial !== undefined
    || typeof wallWithSurface.interiorMaterialPreset === 'string'
    || wallWithSurface.exteriorMaterial !== undefined
    || typeof wallWithSurface.exteriorMaterialPreset === 'string'
    || wallWithSurface.material !== undefined
    || typeof wallWithSurface.materialPreset === 'string'

  walls.push({
    id: wallNode.id,
    start: [...wallNode.start] as [number, number],
    end: [...wallNode.end] as [number, number],
    thickness: wallNode.thickness ?? 0.2,
    length: wallLen,
    ...(Number.isFinite(wallNode.curveOffset) && wallNode.curveOffset !== 0
      ? { curveOffset: wallNode.curveOffset }
      : {}),
    ...(hasWallMaterial ? { hasMaterial: true } : {}),
    children: wallChildren,
  })
}

function serializeZoneNode(
  zoneNode: ZoneNode,
  selection: { zoneId?: string | null; selectedIds?: string[] | null },
  zones: SceneContext['zones'],
  activeZoneRef: { value?: SceneContext['activeZone'] },
): boolean {
  const polygon = zoneNode.polygon as [number, number][] | undefined | null
  if (!polygon || !Array.isArray(polygon) || polygon.length < 3) return false

  const xs = polygon.map((p) => p[0])
  const zs = polygon.map((p) => p[1])
  const zoneBounds = {
    min: [Math.min(...xs), Math.min(...zs)] as [number, number],
    max: [Math.max(...xs), Math.max(...zs)] as [number, number],
  }

  zones.push({
    id: zoneNode.id,
    name: zoneNode.name ?? 'Zone',
    polygon,
    bounds: zoneBounds,
  })

  if (selection.zoneId === zoneNode.id || selection.selectedIds?.includes(zoneNode.id)) {
    activeZoneRef.value = {
      id: zoneNode.id,
      name: zoneNode.name ?? 'Zone',
      bounds: zoneBounds,
    }
  }

  return true
}

function serializeCeilingNode(
  cNode: CeilingNode,
  ceilings: SceneCeilingSummary[],
): void {
  const cPoly = cNode.polygon as [number, number][] | undefined | null
  if (!cPoly || !Array.isArray(cPoly) || cPoly.length < 3) return
  ceilings.push({ id: cNode.id, height: cNode.height ?? 2.5, area: polygonArea(cPoly) })
}

function serializeSlabNode(
  sNode: SlabNode,
  slabs: SceneSlabSummary[],
): void {
  const sPoly = sNode.polygon as [number, number][] | undefined | null
  if (!sPoly || !Array.isArray(sPoly) || sPoly.length < 3) return
  slabs.push({ id: sNode.id, elevation: sNode.elevation ?? 0.05, area: polygonArea(sPoly) })
}

function serializeRoofNode(
  node: AnyNode,
  nodes: Record<string, AnyNode>,
  roofs: SceneRoofSummary[],
): void {
  const rChildren = ('children' in node && Array.isArray(node.children))
    ? (node.children as string[]).map((cid) => nodes[cid as AnyNodeId]).filter(Boolean)
    : []
  const segments = rChildren
    .filter((c): c is AnyNode => !!c && c.type === 'roof-segment')
    .map((seg) => ({
      id: seg.id,
      roofType: (seg as { roofType?: string }).roofType ?? 'gable',
      width: (seg as { width?: number }).width ?? 0,
      depth: (seg as { depth?: number }).depth ?? 0,
    }))
  const r = node as { material?: unknown; materialPreset?: string; topMaterial?: unknown; topMaterialPreset?: string; edgeMaterial?: unknown; edgeMaterialPreset?: string; wallMaterial?: unknown; wallMaterialPreset?: string }
  const hasRoofMaterial =
    r.material !== undefined || typeof r.materialPreset === 'string'
    || r.topMaterial !== undefined || typeof r.topMaterialPreset === 'string'
    || r.edgeMaterial !== undefined || typeof r.edgeMaterialPreset === 'string'
    || r.wallMaterial !== undefined || typeof r.wallMaterialPreset === 'string'
  roofs.push({ id: node.id, ...(hasRoofMaterial ? { hasMaterial: true } : {}), segments })
}

function serializeStairNode(
  node: AnyNode,
  nodes: Record<string, AnyNode>,
  stairs: SceneStairSummary[],
): void {
  const sChildren = ('children' in node && Array.isArray(node.children))
    ? (node.children as string[]).map((cid) => nodes[cid as AnyNodeId]).filter(Boolean)
    : []
  const stairSegments = sChildren
    .filter((c): c is AnyNode => !!c && c.type === 'stair-segment')
    .map((seg) => ({
      id: seg.id,
      segmentType: (seg as { segmentType?: string }).segmentType ?? 'stair',
      width: (seg as { width?: number }).width ?? 1.0,
      length: (seg as { length?: number }).length ?? 3.0,
      height: (seg as { height?: number }).height ?? 2.5,
      stepCount: (seg as { stepCount?: number }).stepCount ?? 10,
      attachmentSide: (seg as { attachmentSide?: string }).attachmentSide ?? 'front',
    }))
  const s = node as {
    position: [number, number, number]
    rotation: number
    stairType?: string
    width?: number
    totalRise?: number
    stepCount?: number
    slabOpeningMode?: string
    innerRadius?: number
    sweepAngle?: number
    topLandingMode?: string
    railingMode?: string
    material?: unknown
    materialPreset?: string
    railingMaterial?: unknown
    railingMaterialPreset?: string
    treadMaterial?: unknown
    treadMaterialPreset?: string
    sideMaterial?: unknown
    sideMaterialPreset?: string
  }
  const hasStairMaterial =
    s.material !== undefined || typeof s.materialPreset === 'string'
    || s.railingMaterial !== undefined || typeof s.railingMaterialPreset === 'string'
    || s.treadMaterial !== undefined || typeof s.treadMaterialPreset === 'string'
    || s.sideMaterial !== undefined || typeof s.sideMaterialPreset === 'string'

  stairs.push({
    id: node.id,
    position: s.position,
    rotation: s.rotation,
    ...(s.stairType ? { stairType: s.stairType } : {}),
    ...(typeof s.width === 'number' ? { width: s.width } : {}),
    ...(typeof s.totalRise === 'number' ? { totalRise: s.totalRise } : {}),
    ...(typeof s.stepCount === 'number' ? { stepCount: s.stepCount } : {}),
    ...(s.slabOpeningMode && s.slabOpeningMode !== 'none' ? { slabOpeningMode: s.slabOpeningMode } : {}),
    ...(typeof s.innerRadius === 'number' && s.stairType !== 'straight' ? { innerRadius: s.innerRadius } : {}),
    ...(typeof s.sweepAngle === 'number' && s.stairType !== 'straight' ? { sweepAngle: s.sweepAngle } : {}),
    ...(s.topLandingMode && s.topLandingMode !== 'none' ? { topLandingMode: s.topLandingMode } : {}),
    ...(s.railingMode && s.railingMode !== 'none' ? { railingMode: s.railingMode } : {}),
    ...(hasStairMaterial ? { hasMaterial: true } : {}),
    segments: stairSegments,
  })
}

function serializeFenceNode(
  node: AnyNode,
  fences: SceneFenceSummary[],
): void {
  const f = node as {
    id: string
    start: [number, number]
    end: [number, number]
    height?: number
    thickness?: number
    style?: 'slat' | 'rail' | 'privacy'
    baseStyle?: 'floating' | 'grounded'
    color?: string
    curveOffset?: number
    material?: unknown
    materialPreset?: string
  }
  const hasFenceMaterial = f.material !== undefined || typeof f.materialPreset === 'string'
  fences.push({
    id: f.id,
    start: [...f.start] as [number, number],
    end: [...f.end] as [number, number],
    height: f.height ?? 1.8,
    thickness: f.thickness ?? 0.08,
    style: f.style ?? 'slat',
    baseStyle: f.baseStyle ?? 'grounded',
    ...(Number.isFinite(f.curveOffset) && f.curveOffset !== 0 ? { curveOffset: f.curveOffset } : {}),
    ...(f.color ? { color: f.color } : {}),
    ...(hasFenceMaterial ? { hasMaterial: true } : {}),
  })
}

/** Invalidate scene cache (call after ghost preview confirm or scene mutation) */
export function invalidateSceneCache(): void {
  sceneContextCache.invalidate()
}

/**
 * Serialize the current scene state into a compact context object for Claude.
 * Only includes the active level's items + zone info.
 * Target: < 4000 tokens for the serialized context.
 *
 * Uses a version-based cache to skip re-serialization when the scene hasn't
 * changed between agentic loop iterations.
 */
export function serializeSceneContext(): SceneContext {
  const { nodes } = useScene.getState()
  const { selection } = useViewer.getState()
  const levelId = selection.levelId

  // Cache hit: use explicit invalidation via invalidateSceneCache()
  // The agent loop calls invalidateSceneCache() after ghost preview confirm.
  if (levelId) {
    const cached = sceneContextCache.get(nodes, levelId)
    if (cached) return cached
  }

  if (!levelId) {
    return {
      levelId: '',
      items: [],
      walls: [],
      zones: [],
      levels: [],
      buildings: [],
      ceilings: [],
      roofs: [],
      slabs: [],
      stairs: [],
      fences: [],
      wallCount: 0,
      zoneCount: 0,
    }
  }

  const items: SceneItemSummary[] = []
  const walls: SceneContext['walls'] = []
  const zones: SceneContext['zones'] = []
  const ceilings: SceneCeilingSummary[] = []
  const roofs: SceneRoofSummary[] = []
  const slabs: SceneSlabSummary[] = []
  const stairs: SceneStairSummary[] = []
  const fences: SceneFenceSummary[] = []
  let wallCount = 0
  let zoneCount = 0
  let activeZone: SceneContext['activeZone'] | undefined

  // Collect all nodes belonging to this level
  const levelNode = nodes[levelId]
  if (!levelNode || !('children' in levelNode)) {
    return { levelId, items: [], walls: [], zones: [], levels: [], buildings: [], ceilings: [], roofs: [], slabs: [], stairs: [], fences: [], wallCount: 0, zoneCount: 0 }
  }

  // Walk through all nodes to find items, walls, and zones on this level
  const visited = new Set<string>()
  const queue: AnyNodeId[] = [levelId]
  const activeZoneRef: { value?: SceneContext['activeZone'] } = {}

  while (queue.length > 0) {
    const nodeId = queue.shift()!
    if (visited.has(nodeId)) continue
    visited.add(nodeId)

    const node = nodes[nodeId]
    if (!node) continue

    // Skip ghost preview / removal / hidden nodes — these are transient and should
    // not be reported to the LLM as actual scene content. Mid-batch tool calls
    // would otherwise see "deleted" walls as still present.
    // Mirrors the same filter used by spatial-queries.ts so spatial reasoning
    // and scene summaries agree.
    const meta = node.metadata as Record<string, unknown> | undefined
    if (
      meta?.isGhostPreview === true
      || meta?.isGhostRemoval === true
      || (node as { visible?: boolean }).visible === false
    ) {
      continue
    }

    switch (node.type) {
      case 'item':
        serializeItemNode(node, items)
        break
      case 'wall':
        wallCount++
        serializeWallNode(node as WallNode, nodes, walls, items, visited)
        break
      case 'zone':
        if (serializeZoneNode(node as ZoneNode, selection, zones, activeZoneRef)) {
          zoneCount++
        }
        if (activeZoneRef.value) {
          activeZone = activeZoneRef.value
          activeZoneRef.value = undefined
        }
        break
      case 'ceiling':
        serializeCeilingNode(node as CeilingNode, ceilings)
        break
      case 'slab':
        serializeSlabNode(node as SlabNode, slabs)
        break
      case 'roof':
        serializeRoofNode(node, nodes, roofs)
        break
      case 'stair':
        serializeStairNode(node, nodes, stairs)
        break
      case 'fence':
        serializeFenceNode(node, fences)
        break
    }

    // Traverse children
    if ('children' in node && Array.isArray(node.children)) {
      for (const childId of node.children) {
        queue.push(childId as AnyNodeId)
      }
    }
  }

  // Collect level information from building
  const levels: SceneLevelSummary[] = []
  const currentLevel = nodes[levelId]
  if (currentLevel?.parentId) {
    const building = nodes[currentLevel.parentId as AnyNodeId]
    if (building && building.type === 'building' && 'children' in building && Array.isArray(building.children)) {
      for (const childId of building.children) {
        const child = nodes[childId as AnyNodeId]
        if (child && child.type === 'level') {
          const lvl = child as { id: string; level?: number; name?: string; children?: unknown[] }
          levels.push({
            id: lvl.id,
            level: lvl.level ?? 0,
            name: lvl.name,
            childCount: Array.isArray(lvl.children) ? lvl.children.length : 0,
          })
        }
      }
    }
  }

  // Collect all buildings on the site
  const buildings: SceneContext['buildings'] = []
  for (const node of Object.values(nodes)) {
    if (node.type === 'building') {
      const bld = node as { id: string; name?: string; position?: [number, number, number]; rotation?: [number, number, number]; children?: string[] }
      const levelChildren = (bld.children ?? []).filter(childId => {
        const child = nodes[childId as AnyNodeId]
        return child?.type === 'level'
      })
      buildings.push({
        id: bld.id,
        name: bld.name,
        position: bld.position ?? [0, 0, 0],
        rotation: bld.rotation ?? [0, 0, 0],
        levelCount: levelChildren.length,
      })
    }
  }

  const result: SceneContext = {
    levelId,
    items,
    walls,
    zones,
    levels,
    buildings,
    ceilings,
    roofs,
    slabs,
    stairs,
    fences,
    wallCount,
    zoneCount,
    activeZone,
  }

  // Update cache
  sceneContextCache.set(result, nodes)

  return result
}

/**
 * Format scene context as a string for the AI system prompt.
 * Includes spatial geometry (zone boundaries, wall positions) so AI can make
 * reasonable placement decisions.
 * Enhanced with semantic spatial descriptions (wall directions, room shape,
 * available areas) to help LLM reason about space more effectively.
 */
export function formatSceneContextForPrompt(ctx: SceneContext): string {
  const lines: string[] = [
    `Current scene (level: ${ctx.levelId}):`,
    `- ${ctx.wallCount} walls, ${ctx.zoneCount} zones, ${ctx.ceilings.length} ceilings, ${ctx.roofs.length} roofs, ${ctx.slabs.length} slabs, ${ctx.stairs.length} stairs, ${ctx.fences.length} fences`,
  ]

  // Building info (site-level)
  if (ctx.buildings.length > 0) {
    lines.push(`\nBuildings on site (${ctx.buildings.length}):`)
    for (const bld of ctx.buildings) {
      const pos = bld.position.map((v) => v.toFixed(1)).join(', ')
      const rotY = (bld.rotation[1] * 180 / Math.PI).toFixed(0)
      lines.push(`  - ${bld.id}${bld.name ? ` "${bld.name}"` : ''}: pos=[${pos}], rotY=${rotY}° (use radians in tools: ${bld.rotation[1].toFixed(2)}rad), ${bld.levelCount} level(s)`)
    }
  }

  // Level info
  if (ctx.levels.length > 0) {
    lines.push(`\nLevels (${ctx.levels.length}):`)
    for (const lv of ctx.levels) {
      const current = lv.id === ctx.levelId ? ' ← current' : ''
      lines.push(`  - ${lv.id} (Level ${lv.level}${lv.name ? `: ${lv.name}` : ''}, ${lv.childCount} children${current})`)
    }
  }

  // Ceiling info
  if (ctx.ceilings.length > 0) {
    lines.push(`\nCeilings (${ctx.ceilings.length}):`)
    for (const c of ctx.ceilings) {
      lines.push(`  - ${c.id}: height=${c.height}m, area=${c.area.toFixed(1)}m²`)
    }
  }

  // Roof info
  if (ctx.roofs.length > 0) {
    lines.push(`\nRoofs (${ctx.roofs.length}):`)
    for (const r of ctx.roofs) {
      const segDescs = r.segments.map((s) => `${s.roofType} ${s.width}×${s.depth}m`).join(', ')
      lines.push(`  - ${r.id}: ${r.segments.length} segment(s) — ${segDescs}`)
    }
  }

  // Slab info
  if (ctx.slabs.length > 0) {
    lines.push(`\nSlabs (${ctx.slabs.length}):`)
    for (const s of ctx.slabs) {
      lines.push(`  - ${s.id}: elevation=${s.elevation}m, area=${s.area.toFixed(1)}m²`)
    }
  }

  // Stair info
  if (ctx.stairs.length > 0) {
    lines.push(`\nStairs (${ctx.stairs.length}):`)
    for (const st of ctx.stairs) {
      const segDescs = st.segments.map((s) =>
        `${s.segmentType} ${s.width}×${s.length}m h=${s.height}m (${s.stepCount} steps, ${s.attachmentSide})`,
      ).join(', ')
      const containerExtras: string[] = []
      if (st.stairType && st.stairType !== 'straight') containerExtras.push(`type=${st.stairType}`)
      if (st.slabOpeningMode && st.slabOpeningMode !== 'none') containerExtras.push(`slabOpening=${st.slabOpeningMode}`)
      if (st.railingMode && st.railingMode !== 'none') containerExtras.push(`railing=${st.railingMode}`)
      if (st.hasMaterial) containerExtras.push('hasMaterial')
      const extra = containerExtras.length > 0 ? ` [${containerExtras.join(', ')}]` : ''
      lines.push(`  - ${st.id}: pos=[${st.position.map((v) => v.toFixed(1)).join(',')}] rot=${st.rotation.toFixed(2)}rad, ${st.segments.length} segment(s) — ${segDescs}${extra}`)
    }
  }

  // Fence info
  if (ctx.fences.length > 0) {
    lines.push(`\nFences (${ctx.fences.length}):`)
    for (const f of ctx.fences) {
      const start = f.start.map((v) => v.toFixed(1)).join(',')
      const end = f.end.map((v) => v.toFixed(1)).join(',')
      const curve = typeof f.curveOffset === 'number' ? ` curveOffset=${f.curveOffset.toFixed(2)}` : ''
      lines.push(`  - ${f.id}: [${start}]→[${end}] h=${f.height}m thick=${f.thickness}m style=${f.style} base=${f.baseStyle}${curve}${f.color ? ` color=${f.color}` : ''}`)
    }
  }

  // Missing prerequisites: flag what the scene is missing so AI can guide user
  if (ctx.wallCount === 0) {
    lines.push('- ⚠️ NO WALLS in this scene. Ask user whether to create walls/room first before placing against-wall furniture.')
  }

  // Zone spatial data with semantic descriptions
  if (ctx.zones.length > 0) {
    lines.push('- Zones:')
    for (const zone of ctx.zones) {
      const sizeX = zone.bounds.max[0] - zone.bounds.min[0]
      const sizeZ = zone.bounds.max[1] - zone.bounds.min[1]
      const area = sizeX * sizeZ
      const shape = Math.abs(sizeX - sizeZ) < 0.5
        ? 'square'
        : sizeX > sizeZ ? 'wide (X-axis longer)' : 'deep (Z-axis longer)'

      lines.push(`  "${zone.name}" (${zone.id}):`)
      lines.push(`    Size: ${sizeX.toFixed(2)}m × ${sizeZ.toFixed(2)}m (${area.toFixed(1)}m²), Shape: ${shape}`)
      lines.push(`    Bounds: min=(${zone.bounds.min[0].toFixed(2)}, ${zone.bounds.min[1].toFixed(2)}) max=(${zone.bounds.max[0].toFixed(2)}, ${zone.bounds.max[1].toFixed(2)})`)
      lines.push(`    Center: (${((zone.bounds.min[0] + zone.bounds.max[0]) / 2).toFixed(2)}, ${((zone.bounds.min[1] + zone.bounds.max[1]) / 2).toFixed(2)})`)

      // Room type analysis based on existing items in this zone
      const zoneItems = ctx.items.filter((item) => {
        const [ix, , iz] = item.position
        return ix >= zone.bounds.min[0] && ix <= zone.bounds.max[0]
          && iz >= zone.bounds.min[1] && iz <= zone.bounds.max[1]
      })
      if (zoneItems.length > 0) {
        const analysis = analyzeRoom(zoneItems.map((i) => ({ catalogSlug: i.catalogSlug, category: i.category })))
        const analysisStr = formatRoomAnalysis(analysis)
        if (analysisStr) {
          lines.push(`    ${analysisStr}`)
        }
      }
    }
  }

  // Wall positions with semantic descriptions (direction, length, orientation)
  if (ctx.walls.length > 0) {
    lines.push('- Walls (with semantic info):')

    // Analyze walls and annotate with semantic info
    const wallInfos = ctx.walls.map((wall) => {
      const dx = wall.end[0] - wall.start[0]
      const dz = wall.end[1] - wall.start[1]
      const length = Math.hypot(dx, dz)
      const angle = Math.atan2(dz, dx)

      // Determine wall orientation
      let orientation: string
      const absDx = Math.abs(dx)
      const absDz = Math.abs(dz)
      if (absDx > absDz * 3) {
        orientation = 'horizontal (along X-axis)'
      } else if (absDz > absDx * 3) {
        orientation = 'vertical (along Z-axis)'
      } else {
        orientation = `diagonal (${(angle * 180 / Math.PI).toFixed(0)}°)`
      }

      // Compute wall inward normal direction
      const normalX = -dz / length
      const normalZ = dx / length

      return { wall, length, orientation, normalX, normalZ, dx, dz }
    })

    // Find the longest wall
    const longestWall = wallInfos.reduce((a, b) => a.length > b.length ? a : b)

    for (const info of wallInfos) {
      const { wall, length, orientation } = info
      const isLongest = info === longestWall ? ' [LONGEST]' : ''
      const wallTags: string[] = []
      if (typeof wall.curveOffset === 'number') wallTags.push(`curveOffset=${wall.curveOffset.toFixed(2)}`)
      if (wall.hasMaterial) wallTags.push('hasMaterial')
      const wallTagStr = wallTags.length > 0 ? ` [${wallTags.join(', ')}]` : ''
      lines.push(`  [${wall.id}] (${wall.start[0].toFixed(2)}, ${wall.start[1].toFixed(2)}) → (${wall.end[0].toFixed(2)}, ${wall.end[1].toFixed(2)}) length=${length.toFixed(2)}m ${orientation}${isLongest}${wallTagStr}`)

      // Show doors/windows on this wall
      if (wall.children && wall.children.length > 0) {
        for (const child of wall.children) {
          lines.push(`    └─ ${child.type} [${child.id}] at localX=${child.localX.toFixed(2)}m width=${child.width.toFixed(2)}m`)
        }
      }
    }

    // Wall summary
    lines.push(`  Summary: longest wall is ${longestWall.length.toFixed(2)}m (${longestWall.orientation})`)
  }

  if (ctx.activeZone) {
    lines.push(`- Active zone: "${ctx.activeZone.name}" (${ctx.activeZone.id})`)
    if (ctx.activeZone.bounds) {
      lines.push(`  Bounds: min=(${ctx.activeZone.bounds.min[0].toFixed(2)}, ${ctx.activeZone.bounds.min[1].toFixed(2)}) max=(${ctx.activeZone.bounds.max[0].toFixed(2)}, ${ctx.activeZone.bounds.max[1].toFixed(2)})`)
    }
  }

  // Existing items with grouping info
  lines.push(`- ${ctx.items.length} items:`)
  if (ctx.items.length === 0) {
    lines.push('  (empty — no items placed yet)')
  } else {
    for (const item of ctx.items) {
      const pos = item.position.map((v) => v.toFixed(2)).join(', ')
      const dim = item.dimensions.map((v) => v.toFixed(2)).join('×')
      lines.push(`  [${item.id}] ${item.name} (${item.catalogSlug}) at (${pos}) rot=${item.rotationY.toFixed(2)} size=${dim}m`)
    }

    // Available area analysis (simplified: based on zone bounds and existing item positions)
    // Pre-compute item positions once, then assign to zone quadrants via lookup
    if (ctx.zones.length > 0) {
      lines.push('- Available areas (approximate, avoiding existing items):')

      // Build a spatial index: for each zone, classify items into quadrants in a single pass
      for (const zone of ctx.zones) {
        const midX = (zone.bounds.min[0] + zone.bounds.max[0]) / 2
        const midZ = (zone.bounds.min[1] + zone.bounds.max[1]) / 2

        // Count items per quadrant in a single pass over items
        const quadrantCounts = [0, 0, 0, 0] // TL, TR, BL, BR
        const quadrantNames = [
          'top-left (min X, min Z)',
          'top-right (max X, min Z)',
          'bottom-left (min X, max Z)',
          'bottom-right (max X, max Z)',
        ]

        for (const item of ctx.items) {
          const cx = item.position[0]
          const cz = item.position[2]
          // Defensive: schema can drift to omit Z; never silently miscount the quadrant.
          if (typeof cx !== 'number' || typeof cz !== 'number') continue
          // Skip items outside this zone's bounds entirely
          if (cx < zone.bounds.min[0] || cx > zone.bounds.max[0] || cz < zone.bounds.min[1] || cz > zone.bounds.max[1]) continue
          // Assign to quadrant: bit 0 = right half (X >= midX), bit 1 = bottom half (Z >= midZ)
          const qi = (cx >= midX ? 1 : 0) + (cz >= midZ ? 2 : 0)
          quadrantCounts[qi] = (quadrantCounts[qi] ?? 0) + 1
        }

        for (let qi = 0; qi < 4; qi++) {
          const status = quadrantCounts[qi] === 0
            ? 'EMPTY (available)'
            : `${quadrantCounts[qi]} items`
          lines.push(`    ${quadrantNames[qi]}: ${status}`)
        }
      }
    }
  }

  // Inject recent tool errors to help LLM avoid repeating mistakes (#6)
  const recentErrors = useAIChat.getState().getRecentErrors()
  if (recentErrors.length > 0) {
    lines.push('')
    lines.push('## Recent Errors (avoid repeating these)')
    for (const { tool, reason, count } of recentErrors.slice(0, 5)) {
      lines.push(`- ${tool}: ${reason} (failed ${count}x)`)
    }
  }

  const result = lines.join('\n')

  // Guard: truncate if exceeds API limit (MAX_SCENE_CONTEXT_LENGTH = 16000)
  // Prioritize keeping the header + walls + zones and truncate item details
  const MAX_CONTEXT_LENGTH = 15000 // Leave margin below 16000 API limit
  if (result.length > MAX_CONTEXT_LENGTH) {
    // Rebuild with truncated item list
    const truncatedLines = lines.filter((l) => !l.startsWith('  [item_') && !l.includes('quadrant'))
    const truncated = truncatedLines.join('\n')
    if (truncated.length > MAX_CONTEXT_LENGTH) {
      return truncated.slice(0, MAX_CONTEXT_LENGTH) + '\n[... truncated due to scene complexity]'
    }
    return truncated + `\n[... ${ctx.items.length} items truncated for brevity]`
  }

  return result
}
