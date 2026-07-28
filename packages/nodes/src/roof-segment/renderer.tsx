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

const ROOF_SLOT_ORDER: readonly RoofSlotId[] = ['fascia', 'gable', 'soffit', 'shingle']

const ROOF_LEGACY_ROLE_BY_SLOT: Record<RoofSlotId, RoofSegmentSurfaceMaterialRole> = {
  fascia: 'edge',
  gable: 'wall',
  soffit: 'wall',
  shingle: 'top',
}

export const RoofSegmentRenderer = ({ node }: { node: RoofSegmentNode }) => {
  const ref = useRef<THREE.Mesh>(null!)
  const parentNode = useScene((state) =>
    node.parentId ? (state.nodes[node.parentId as AnyNodeId] as RoofNode | undefined) : undefined,
  )
  const needsSceneMaterials = Boolean(
    (node.slots && Object.keys(node.slots).length > 0) ||
      (parentNode?.slots && Object.keys(parentNode.slots).length > 0),
  )
  const sceneMaterials = useScene((state) => (needsSceneMaterials ? state.materials : undefined))

  useRegistry(node.id, 'roof-segment', ref)

  const handlers = useNodeEvents(node, 'roof-segment')
  const debugColors = useViewer((s) => s.debugColors)
  const shading = useViewer((s) => s.shading)
  const textures = useViewer((s) => s.textures)
  const colorPreset = useViewer((s) => s.colorPreset)
  const sceneTheme = useViewer((s) => s.sceneTheme)
  // 4 groups map 1:1 to the roof's 4-material array (see getRoofMaterialArray).
  const placeholderGeometry = useMemo(() => createPlaceholderGeometry(4), [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps deliberately list the build inputs; depending on the whole object would rebuild on unrelated field changes.
  const customMaterial = useMemo(() => {
    const resolveSlot = (slotId: RoofSlotId): THREE.Material | null => {
      const segmentRef = node.slots?.[slotId]
      if (segmentRef) {
        const resolved = resolveMaterialRef(segmentRef, sceneMaterials, shading)
        if (resolved) return resolved
      }

      const role = ROOF_LEGACY_ROLE_BY_SLOT[slotId]
      const segmentSpec = getEffectiveSegmentSurfaceMaterial(node, role)
      if (typeof segmentSpec.materialPreset === 'string') {
        const resolved = createMaterialFromPresetRef(segmentSpec.materialPreset, shading)
        if (resolved) return resolved
      }
      if (segmentSpec.material !== undefined) {
        return createMaterial(segmentSpec.material, shading)
      }

      const parentRef = parentNode?.slots?.[slotId]
      if (parentRef) {
        const resolved = resolveMaterialRef(parentRef, sceneMaterials, shading)
        if (resolved) return resolved
      }

      const parentSpec = parentNode ? getEffectiveRoofSurfaceMaterial(parentNode, role) : undefined
      if (typeof parentSpec?.materialPreset === 'string') {
        const resolved = createMaterialFromPresetRef(parentSpec.materialPreset, shading)
        if (resolved) return resolved
      }
      if (parentSpec?.material !== undefined) {
        return createMaterial(parentSpec.material, shading)
      }
      return null
    }

    // Themed parent-roof array (per-role scene-theme colours) — used both as the
    // full fallback and to fill any individual untextured slot below.
    const themedArray = parentNode
      ? getRoofMaterialArray(parentNode, shading, textures, colorPreset, sceneTheme, sceneMaterials)
      : null

    const resolved = ROOF_SLOT_ORDER.map((slotId) => resolveSlot(slotId))

    if (!resolved.some((entry) => entry !== null)) {
      return themedArray
    }

    const fallbackAt = (index: number): THREE.Material =>
      themedArray?.[index] ?? new THREE.MeshStandardMaterial()
    return resolved.map((entry, index) => entry ?? fallbackAt(index)) as THREE.Material[]
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
