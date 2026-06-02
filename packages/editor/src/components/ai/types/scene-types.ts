// ============================================================================
// Scene Context (sent to Claude API)
// ============================================================================

export interface SceneWallSummary {
  id: string
  start: [number, number]
  end: [number, number]
  thickness: number
  length?: number
  /** Sagitta offset (meters). Present only when the wall is curved (omitted when 0/undefined). */
  curveOffset?: number
  /** Set when the wall has a role-specific (interior/exterior/legacy) material assignment. */
  hasMaterial?: boolean
  children?: { type: string; id: string; localX: number; width: number }[]
}

export interface SceneZoneSummary {
  id: string
  name: string
  polygon: [number, number][]
  bounds: { min: [number, number]; max: [number, number] }
}

export interface SceneLevelSummary {
  id: string
  level: number
  name?: string
  childCount: number
}

export interface SceneCeilingSummary {
  id: string
  height: number
  area: number
}

export interface SceneRoofSummary {
  id: string
  /** Set when any role-specific (top/edge/wall/legacy) material is assigned. */
  hasMaterial?: boolean
  segments: { id: string; roofType: string; width: number; depth: number }[]
}

export interface SceneFenceSummary {
  id: string
  start: [number, number]
  end: [number, number]
  height: number
  thickness: number
  style: 'slat' | 'rail' | 'privacy'
  baseStyle: 'floating' | 'grounded'
  /** Sagitta offset (meters). Present only when the fence is curved. */
  curveOffset?: number
  color?: string
  /** Set when the fence has a material/materialPreset assignment. */
  hasMaterial?: boolean
}

export interface SceneSlabSummary {
  id: string
  elevation: number
  area: number
}

export interface SceneStairSummary {
  id: string
  position: [number, number, number]
  rotation: number
  /** straight | curved | spiral. Drives which container fields are meaningful. */
  stairType?: string
  /** Container-level dimensions (curved/spiral stairs ignore segments). */
  width?: number
  totalRise?: number
  stepCount?: number
  /** Auto-cutout setting on destination level slab/ceiling. */
  slabOpeningMode?: string
  /** Curved/spiral stair geometry. */
  innerRadius?: number
  sweepAngle?: number
  /** Spiral stair extras. */
  topLandingMode?: string
  /** none | left | right | both. */
  railingMode?: string
  /** Set when any role-specific (railing/tread/side/legacy) material is assigned. */
  hasMaterial?: boolean
  segments: {
    id: string
    segmentType: string
    width: number
    length: number
    height: number
    stepCount: number
    attachmentSide: string
  }[]
}

export interface SceneItemSummary {
  id: string
  name: string
  catalogSlug: string
  position: [number, number, number]
  rotationY: number
  dimensions: [number, number, number]
  category: string
}

export interface SceneBuildingSummary {
  id: string
  name?: string
  position: [number, number, number]
  rotation: [number, number, number]
  levelCount: number
}

export interface SceneContext {
  activeZone?: {
    id: string
    name: string
    bounds?: { min: [number, number]; max: [number, number] }
  }
  levelId: string
  items: SceneItemSummary[]
  walls: SceneWallSummary[]
  zones: SceneZoneSummary[]
  levels: SceneLevelSummary[]
  buildings: SceneBuildingSummary[]
  ceilings: SceneCeilingSummary[]
  roofs: SceneRoofSummary[]
  slabs: SceneSlabSummary[]
  stairs: SceneStairSummary[]
  fences: SceneFenceSummary[]
  wallCount: number
  zoneCount: number
}
