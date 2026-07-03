'use client'

import {
  type AnyNodeId,
  getEffectiveRoofSurfaceMaterial,
  getEffectiveSegmentSurfaceMaterial,
  type RoofNode,
  type RoofSegmentNode,
  type RoofSegmentSurfaceMaterialRole,
  type RoofSlotId,
  useRegistry,
  useScene,
} from '@aedifex/core'
import {
  createMaterial,
  createMaterialFromPresetRef,
  getRoofMaterialArray,
  resolveMaterialRef,
  useNodeEvents,
  useViewer,
} from '@aedifex/viewer'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { getRoofDebugMaterials, getRoofMaterials } from '../roof/roof-materials'
import { createPlaceholderGeometry } from '../shared/placeholder-geometry'

// The 4 material groups the merged-roof mesh renders with map 1:1 to these
// roof slots. Kept in sync with `getRoofMaterialArray`'s slot order in the
// viewer — the segment mesh reuses that array's shape.
const ROOF_SLOT_ORDER: readonly RoofSlotId[] = ['fascia', 'gable', 'soffit', 'shingle']

// Slot ↔ legacy role mapping — used to fall back onto the pre-migration
// `topMaterial*` / `edgeMaterial*` / `wallMaterial*` fields when a slot is
// unset on both the segment and its parent roof.
const ROOF_LEGACY_ROLE_BY_SLOT: Record<RoofSlotId, RoofSegmentSurfaceMaterialRole> = {
  fascia: 'edge',
  gable: 'wall',
  soffit: 'wall',
  shingle: 'top',
}

export const RoofSegmentRenderer = ({ node }: { node: RoofSegmentNode }) => {
  const ref = useRef<THREE.Mesh>(null!)
  const nodes = useScene((state) => state.nodes)
  // Subscribe to the scene-material palette so editing a `scene:` material a
  // segment slot references re-renders the segment live.
  const sceneMaterials = useScene((s) => s.materials)

  useRegistry(node.id, 'roof-segment', ref)

  const handlers = useNodeEvents(node, 'roof-segment')
  const debugColors = useViewer((s) => s.debugColors)
  const shading = useViewer((s) => s.shading)
  const textures = useViewer((s) => s.textures)
  const colorPreset = useViewer((s) => s.colorPreset)
  const sceneTheme = useViewer((s) => s.sceneTheme)
  const parentNode = node.parentId
    ? (nodes[node.parentId as AnyNodeId] as RoofNode | undefined)
    : undefined
  // 4 groups map 1:1 to the roof's 4-material array (see getRoofMaterialArray).
  const placeholderGeometry = useMemo(() => createPlaceholderGeometry(4), [])

  // Segment material precedence, per slot:
  //   1. Segment's `node.slots[slotId]` override.
  //   2. Segment's legacy role-specific override (topMaterial, edgeMaterial, wallMaterial).
  //   3. Segment's catch-all `material` (legacy single-slot paint).
  //   4. Parent roof's `node.slots[slotId]` override.
  //   5. Parent roof's legacy role-specific material.
  //   6. Parent roof's catch-all material.
  //   7. Default `roofMaterials` (handled at the `material =` line below).
  //
  // The 4-slot layout matches getRoofMaterialArray:
  //   slot 0 → 'fascia'  (rake / edge trim)
  //   slot 1 → 'gable'   (wall band under the roof surface)
  //   slot 2 → 'soffit'  (interior underside)
  //   slot 3 → 'shingle' (top cladding)
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps deliberately list the build inputs; depending on the whole object would rebuild on unrelated field changes.
  const customMaterial = useMemo(() => {
    const resolveSlot = (slotId: RoofSlotId): THREE.Material | null => {
      // 1. Segment slot ref.
      const segRef = node.slots?.[slotId]
      if (segRef) {
        const resolved = resolveMaterialRef(segRef, sceneMaterials, shading)
        if (resolved) return resolved
      }
      // 2-3. Segment legacy role + catch-all.
      const role = ROOF_LEGACY_ROLE_BY_SLOT[slotId]
      const segSpec = getEffectiveSegmentSurfaceMaterial(node, role, undefined)
      if (typeof segSpec.materialPreset === 'string') {
        const resolved = createMaterialFromPresetRef(segSpec.materialPreset, shading)
        if (resolved) return resolved
      }
      if (segSpec.material !== undefined) {
        return createMaterial(segSpec.material, shading)
      }
      // 4. Parent roof slot ref.
      const parentRef = parentNode?.slots?.[slotId]
      if (parentRef) {
        const resolved = resolveMaterialRef(parentRef, sceneMaterials, shading)
        if (resolved) return resolved
      }
      // 5-6. Parent roof legacy per-role + catch-all.
      const parentSpec = parentNode ? getEffectiveRoofSurfaceMaterial(parentNode, role) : undefined
      if (parentSpec) {
        if (typeof parentSpec.materialPreset === 'string') {
          const resolved = createMaterialFromPresetRef(parentSpec.materialPreset, shading)
          if (resolved) return resolved
        }
        if (parentSpec.material !== undefined) {
          return createMaterial(parentSpec.material, shading)
        }
      }
      return null
    }

    // Themed parent-roof array (per-role scene-theme colours) — used both as the
    // full fallback and to fill any individual untextured slot below.
    const themedArray = parentNode
      ? getRoofMaterialArray(
          parentNode,
          shading,
          textures,
          colorPreset,
          sceneTheme,
          sceneMaterials,
        )
      : null

    const resolved = ROOF_SLOT_ORDER.map((slotId) => resolveSlot(slotId))
    const anyResolved = resolved.some((entry) => entry !== null)

    if (!anyResolved) {
      return themedArray
    }

    // Some slots have explicit materials; fill the rest from the themed array so
    // an untextured slot still picks up the scene-theme role colour, not blank white.
    // Per-slot only, then the themed parent slot — no cross-slot fallback.
    const fillFromArray = (i: number): THREE.Material =>
      themedArray?.[i] ?? new THREE.MeshStandardMaterial()
    return resolved.map((entry, i) => entry ?? fillFromArray(i)) as THREE.Material[]
  }, [
    node.material,
    node.materialPreset,
    node.topMaterial,
    node.topMaterialPreset,
    node.edgeMaterial,
    node.edgeMaterialPreset,
    node.wallMaterial,
    node.wallMaterialPreset,
    node.slots,
    parentNode,
    shading,
    textures,
    colorPreset,
    sceneTheme,
    sceneMaterials,
  ])

  const material = debugColors
    ? getRoofDebugMaterials(shading)
    : customMaterial || getRoofMaterials(shading, textures, colorPreset)

  useEffect(() => {
    return () => {
      placeholderGeometry.dispose()
    }
  }, [placeholderGeometry])

  return (
    <mesh
      geometry={placeholderGeometry}
      material={material}
      position={node.position}
      ref={ref}
      rotation-y={node.rotation}
      visible={node.visible}
      {...handlers}
    />
  )
}

export default RoofSegmentRenderer
