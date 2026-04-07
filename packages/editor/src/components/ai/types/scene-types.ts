// ============================================================================
// Scene Context (sent to Claude API)
// ============================================================================

export interface SceneWallSummary {
  id: string
  start: [number, number]
  end: [number, number]
  thickness: number
  length?: number
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
  segments: { id: string; roofType: string; width: number; depth: number }[]
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
  ceilings: SceneCeilingSummary[]
  roofs: SceneRoofSummary[]
  slabs: SceneSlabSummary[]
  stairs: SceneStairSummary[]
  wallCount: number
  zoneCount: number
}
