import {
  getEffectiveRoofSurfaceMaterial,
  parseMaterialRef,
  ROOF_SLOT_DEFAULTS,
  type RoofNode,
  type RoofSegmentNode,
  type RoofSlotId,
  type SceneMaterial,
  type SceneMaterialId,
} from '@aedifex/core'
import type * as THREE from 'three'
import {
  type ColorPreset,
  createMaterial,
  createMaterialFromPresetRef,
  createSurfaceRoleMaterial,
  type RenderShading,
  resolveMaterialRef,
  resolveSlotDefaultMaterial,
} from '../../lib/materials'

type SceneMaterials = Record<SceneMaterialId, SceneMaterial> | undefined

// The 4 material groups the merged-roof mesh renders with map 1:1 to the four
// roof slots on the unified paint-slot model:
//   index 0 → `fascia`  (rake / edge trim)
//   index 1 → `gable`   (wall band under the roof surface)
//   index 2 → `soffit`  (interior underside)
//   index 3 → `shingle` (top cladding — the visible face)
// Kept in one place so the render order and the slot ids never drift.
const ROOF_SLOT_ORDER: readonly RoofSlotId[] = ['fascia', 'gable', 'soffit', 'shingle']

// Legacy per-role fallback used when a slot is unset and the pre-migration
// `topMaterial*` / `edgeMaterial*` / `wallMaterial*` catch-alls (via
// `getEffectiveRoofSurfaceMaterial`) still carry the intended appearance. The
// mapping matches the historical role-to-index arrangement (edge→0, wall→1,
// wall→2, top→3) so a scene that never migrated to slots renders unchanged.
const ROOF_LEGACY_ROLE_BY_SLOT: Record<RoofSlotId, 'top' | 'edge' | 'wall'> = {
  fascia: 'edge',
  gable: 'wall',
  soffit: 'wall',
  shingle: 'top',
}

// Declared catalog defaults for an unpainted roof, per the 4-slot layout —
// mirrored from core's ROOF_SLOT_DEFAULTS so the slot declaration (nodes) and
// the material resolver (viewer) share one value. The gable band mirrors the
// wall kind's default so a roof reads as continuous with the walls below it.
const ROOF_DEFAULT_REFS: [string, string, string, string] = [
  ROOF_SLOT_DEFAULTS.fascia,
  ROOF_SLOT_DEFAULTS.gable,
  ROOF_SLOT_DEFAULTS.soffit,
  ROOF_SLOT_DEFAULTS.shingle,
]

export type RoofMaterialArray = [THREE.Material, THREE.Material, THREE.Material, THREE.Material]

const roofMaterialArrayCache = new Map<string, RoofMaterialArray>()

function getSurfaceMaterialSignature(
  spec: ReturnType<typeof getEffectiveRoofSurfaceMaterial>,
): string {
  return JSON.stringify({
    material: spec.material ?? null,
    materialPreset: spec.materialPreset ?? null,
  })
}

function createResolvedMaterial(
  material: RoofNode['material'] | RoofSegmentNode['material'] | undefined,
  materialPreset: string | undefined,
  shading: RenderShading,
): THREE.Material | null {
  if (materialPreset) {
    return createMaterialFromPresetRef(materialPreset, shading)
  }

  if (material) {
    return createMaterial(material, shading)
  }

  return null
}

// Cache-key fragment for one slot: the slot ref plus, for a `scene:` ref, the
// referenced material's *content* — so editing a scene material assigned to a
// roof invalidates the cache (a `library:` ref is static catalog content, so
// its id alone is enough). Falls back to the legacy signature when unmigrated.
function roofSlotSignature(
  ref: string | undefined,
  legacySpec: ReturnType<typeof getEffectiveRoofSurfaceMaterial>,
  sceneMaterials: SceneMaterials,
): string {
  if (ref) {
    const parsed = parseMaterialRef(ref)
    if (parsed?.kind === 'scene') {
      return JSON.stringify({
        ref,
        material: sceneMaterials?.[parsed.id as SceneMaterialId]?.material ?? null,
      })
    }
    return JSON.stringify({ ref })
  }
  return getSurfaceMaterialSignature(legacySpec)
}

export function getRoofMaterialArray(
  node: RoofNode,
  shading: RenderShading = 'rendered',
  textures = true,
  colorPreset: ColorPreset = 'clay',
  sceneTheme?: string,
  sceneMaterials?: SceneMaterials,
): RoofMaterialArray | null {
  const slotSpecs = ROOF_SLOT_ORDER.map((slotId) => {
    const ref = node.slots?.[slotId]
    const legacyRole = ROOF_LEGACY_ROLE_BY_SLOT[slotId]
    const legacySpec = getEffectiveRoofSurfaceMaterial(node, legacyRole)
    return { slotId, ref, legacySpec }
  })

  const cacheKey = JSON.stringify({
    shading,
    textures,
    colorPreset,
    sceneTheme,
    slots: slotSpecs.map(({ slotId, ref, legacySpec }) => [
      slotId,
      roofSlotSignature(ref, legacySpec, sceneMaterials),
    ]),
  })

  const cached = roofMaterialArrayCache.get(cacheKey)
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
    roofMaterialArrayCache.set(cacheKey, roleArray)
    return roleArray
  }

  // Textures-on default appearance: catalog finishes per slot (terracotta
  // shingle, soft-white deck/soffit, wall-coloured trim). Used both when the
  // roof is unpainted and to fill any individual unpainted slot below.
  const defaultArray: RoofMaterialArray = [
    resolveSlotDefaultMaterial(ROOF_DEFAULT_REFS[0], shading),
    resolveSlotDefaultMaterial(ROOF_DEFAULT_REFS[1], shading),
    resolveSlotDefaultMaterial(ROOF_DEFAULT_REFS[2], shading),
    resolveSlotDefaultMaterial(ROOF_DEFAULT_REFS[3], shading),
  ]

  // Slot-first resolution per index: `node.slots[slotId]` ref → legacy per-role
  // material (`topMaterial*` / `edgeMaterial*` / `wallMaterial*` / catch-all
  // `material*`) → declared slot default. A dangling `scene:` ref (material
  // deleted / copied across scenes) falls through to the legacy value and then
  // the declared default — it never blocks rendering (the dangling-ref rule).
  const resolvedArray = slotSpecs.map(({ ref, legacySpec }, index) => {
    if (ref) {
      const slotMaterial = resolveMaterialRef(ref, sceneMaterials, shading)
      if (slotMaterial) return slotMaterial
    }
    const legacyMaterial = createResolvedMaterial(
      legacySpec.material,
      legacySpec.materialPreset,
      shading,
    )
    if (legacyMaterial) return legacyMaterial
    return defaultArray[index] as THREE.Material
  }) as RoofMaterialArray

  // If nothing painted anywhere (no slots, no legacy fields), still cache the
  // default array — matches the old code path which short-circuited here.
  const anyOverride = slotSpecs.some(
    ({ ref, legacySpec }) =>
      ref !== undefined || legacySpec.material !== undefined || legacySpec.materialPreset,
  )
  const finalArray = anyOverride ? resolvedArray : defaultArray

  roofMaterialArrayCache.set(cacheKey, finalArray)
  return finalArray
}
