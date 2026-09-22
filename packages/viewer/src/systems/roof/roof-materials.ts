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
    const legacySpec = getEffectiveRoofSurfaceMaterial(node, ROOF_LEGACY_ROLE_BY_SLOT[slotId])
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

  // Textures-on default appearance: catalog finishes per slot (terracotta
  // shingle, soft-white deck/soffit, wall-coloured trim). Used both when the
  // roof is unpainted and to fill any individual unpainted slot below.
  const defaultArray: RoofMaterialArray = [
    resolveSlotDefaultMaterial(ROOF_DEFAULT_REFS[0], shading),
    resolveSlotDefaultMaterial(ROOF_DEFAULT_REFS[1], shading),
    resolveSlotDefaultMaterial(ROOF_DEFAULT_REFS[2], shading),
    resolveSlotDefaultMaterial(ROOF_DEFAULT_REFS[3], shading),
  ]

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
    return legacyMaterial ?? (defaultArray[index] as THREE.Material)
  }) as RoofMaterialArray

  const anyOverride = slotSpecs.some(
    ({ ref, legacySpec }) =>
      ref !== undefined ||
      legacySpec.material !== undefined ||
      legacySpec.materialPreset !== undefined,
  )
  const finalArray = anyOverride ? resolvedArray : defaultArray

  setCachedRoofMaterialArray(cacheKey, finalArray)
  return finalArray
}
