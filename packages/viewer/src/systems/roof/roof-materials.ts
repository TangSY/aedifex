import {
  type AnyNode,
  type AnyNodeId,
  findLevelBelowId,
  getEffectiveRoofSurfaceMaterial,
  getLevelElevations,
  parseMaterialRef,
  ROOF_SLOT_DEFAULTS,
  type RoofNode,
  type RoofSegmentNode,
  type SceneMaterial,
  type SceneMaterialId,
  type WallNode,
  wallAssemblyFinishRef,
  type RoofSlotId,
} from '@aedifex/core'
import type * as THREE from 'three'
import {
  type ColorPreset,
  createMaterial,
  createSurfaceRoleMaterial,
  type RenderShading,
  resolveMaterialRef,
  resolveSlotDefaultMaterial,
} from '../../lib/materials'

type SceneMaterials = Record<SceneMaterialId, SceneMaterial> | undefined

const ROOF_SLOT_ORDER: readonly RoofSlotId[] = ['fascia', 'gable', 'soffit', 'shingle']

const ROOF_LEGACY_ROLE_BY_SLOT: Record<RoofSlotId, 'top' | 'edge' | 'wall'> = {
  fascia: 'edge',
  gable: 'wall',
  soffit: 'wall',
  shingle: 'top',
}

const ROOF_DEFAULT_REFS: [string, string, string, string] = [
  ROOF_SLOT_DEFAULTS.fascia,
  ROOF_SLOT_DEFAULTS.gable,
  ROOF_SLOT_DEFAULTS.soffit,
  ROOF_SLOT_DEFAULTS.shingle,
]

export type RoofMaterialArray = [THREE.Material, THREE.Material, THREE.Material, THREE.Material]

const ROOF_MATERIAL_ARRAY_CACHE_MAX = 200
const roofMaterialArrayCache = new Map<string, RoofMaterialArray>()

function setCachedRoofMaterialArray(key: string, value: RoofMaterialArray): void {
  if (roofMaterialArrayCache.has(key)) {
    roofMaterialArrayCache.delete(key)
  } else if (roofMaterialArrayCache.size >= ROOF_MATERIAL_ARRAY_CACHE_MAX) {
    const oldestKey = roofMaterialArrayCache.keys().next().value
    if (oldestKey !== undefined) {
      roofMaterialArrayCache.delete(oldestKey)
    }
  }
  roofMaterialArrayCache.set(key, value)
}

function getCachedRoofMaterialArray(key: string): RoofMaterialArray | undefined {
  const value = roofMaterialArrayCache.get(key)
  if (value) {
    roofMaterialArrayCache.delete(key)
    roofMaterialArrayCache.set(key, value)
  }
  return value
}

function getSurfaceMaterialSignature(
  spec: ReturnType<typeof getEffectiveRoofSurfaceMaterial>,
  sceneMaterials: SceneMaterials,
): string {
  const ref = parseMaterialRef(spec.materialPreset)
  return JSON.stringify({
    material: spec.material ?? null,
    materialPreset: spec.materialPreset ?? null,
    sceneMaterial:
      ref?.kind === 'scene'
        ? (sceneMaterials?.[ref.id as SceneMaterialId]?.material ?? null)
        : null,
  })
}

function createResolvedMaterial(
  material: RoofNode['material'] | RoofSegmentNode['material'] | undefined,
  materialPreset: string | undefined,
  sceneMaterials: SceneMaterials,
  shading: RenderShading,
): THREE.Material | null {
  // An unknown or dangling ref resolves to nothing: fall through to the
  // colour, then the slot default, as the segment renderer does.
  const preset = resolveMaterialRef(materialPreset, sceneMaterials, shading)
  if (preset) return preset

  if (material) {
    return createMaterial(material, shading)
  }

  return null
}

/**
 * The cladding the walls under a roof declare through their ASSEMBLIES
 * (`wall.assembly.exterior.finish` → catalog ref), so the roof's gable band —
 * the triangle of wall above the plate that the roof kind builds — is skinned
 * like the walls it sits on instead of the bare drywall default. The walls are
 * the roof's level's, or for a roof on a level of its own (a building's roof
 * level), the storey's directly below. The most common ref among them wins;
 * null when none declares one.
 */
export function levelWallCladdingRef(
  nodes: Readonly<Record<string, AnyNode | undefined>>,
  roof: Pick<RoofNode, 'parentId'>,
): string | null {
  const levelId = roof.parentId
  if (!levelId) return null
  const wallsOn = (id: string | null) =>
    Object.values(nodes).filter(
      (node): node is WallNode => node?.type === 'wall' && node.parentId === id,
    )
  const own = wallsOn(levelId)
  const walls = own.length
    ? own
    : wallsOn(findLevelBelowId(levelId, getLevelElevations(nodes as Record<AnyNodeId, AnyNode>)))
  const counts = new Map<string, number>()
  for (const wall of walls) {
    const ref = wallAssemblyFinishRef(wall)
    if (ref) counts.set(ref, (counts.get(ref) ?? 0) + 1)
  }
  let best: string | null = null
  let bestCount = 0
  for (const [ref, count] of counts) {
    if (count > bestCount) {
      best = ref
      bestCount = count
    }
  }
  return best
}

function roofSlotSignature(
  ref: string | undefined,
  legacySpec: ReturnType<typeof getEffectiveRoofSurfaceMaterial>,
  sceneMaterials: SceneMaterials,
): string {
  const parsed = parseMaterialRef(ref)
  return JSON.stringify({
    ref: ref ?? null,
    material:
      parsed?.kind === 'scene'
        ? (sceneMaterials?.[parsed.id as SceneMaterialId]?.material ?? null)
        : null,
    legacy: getSurfaceMaterialSignature(legacySpec, sceneMaterials),
  })
}

export function getRoofMaterialArray(
  node: RoofNode,
  shading: RenderShading = 'rendered',
  textures = true,
  colorPreset: ColorPreset = 'clay',
  sceneTheme?: string,
  wallCladdingRef: string | null = null,
  sceneMaterials?: SceneMaterials,
): RoofMaterialArray | null {
  const slotSpecs = ROOF_SLOT_ORDER.map((slotId) => {
    const ref = node.slots?.[slotId]
    const legacySpec = getEffectiveRoofSurfaceMaterial(node, ROOF_LEGACY_ROLE_BY_SLOT[slotId])
    return { slotId, ref, legacySpec }
  })

  const cacheKey = JSON.stringify({
    shading,
    textures,
    colorPreset,
    sceneTheme,
    wallCladdingRef,
    slots: slotSpecs.map(({ slotId, ref, legacySpec }) => [
      slotId,
      roofSlotSignature(ref, legacySpec, sceneMaterials),
    ]),
  })

  const cached = getCachedRoofMaterialArray(cacheKey)
  if (cached) return cached

  // Themed role colours: roof top/edge use the 'roof' role, the soffit/underside
  // uses 'ceiling'. These also fill any untextured slot so an untextured roof is
  // theme-coloured regardless of the textures toggle (no more white default).
  const roofMaterial = createSurfaceRoleMaterial('roof', colorPreset, undefined, sceneTheme)
  const ceilingMaterial = createSurfaceRoleMaterial('ceiling', colorPreset, undefined, sceneTheme)
  const roleArray: RoofMaterialArray = [
    roofMaterial,
    ceilingMaterial,
    ceilingMaterial,
    roofMaterial,
  ]

  // Textures-off (monochrome) is the guaranteed escape hatch: themed role
  // colours, no catalog finishes.
  if (!textures) {
    setCachedRoofMaterialArray(cacheKey, roleArray)
    return roleArray
  }

  // Resolve defaults only for unpainted slots so captures do not wait for unused textures.
  const resolvedArray = slotSpecs.map(({ ref, legacySpec }, index) => {
    if (ref) {
      const slotMaterial = resolveMaterialRef(ref, sceneMaterials, shading)
      if (slotMaterial) return slotMaterial
    }

    const legacyMaterial = createResolvedMaterial(
      legacySpec.material,
      legacySpec.materialPreset,
      sceneMaterials,
      shading,
    )
    return (
      legacyMaterial ??
      resolveSlotDefaultMaterial(
        index === 1 && wallCladdingRef ? wallCladdingRef : ROOF_DEFAULT_REFS[index]!,
        shading,
      )
    )
  }) as RoofMaterialArray

  setCachedRoofMaterialArray(cacheKey, resolvedArray)
  return resolvedArray
}
