'use client'

import {
  type AnyNodeId,
  getEffectiveNode,
  getEffectiveRoofSurfaceMaterial,
  getEffectiveSegmentSurfaceMaterial,
  getSegmentFasciaMaterial,
  isGlazedRoofSegment,
  type RoofNode,
  type RoofSegmentNode,
  type RoofSegmentSurfaceMaterialRole,
  type RoofSlotId,
  useLiveNodeOverrides,
  useRegistry,
  useScene,
} from '@aedifex/core'
import {
  createMaterial,
  getRoofMaterialArray,
  levelWallCladdingRef,
  resolveMaterialRef,
  SHADOW_ONLY_LAYER,
  useNodeEvents,
  useViewer,
} from '@aedifex/viewer'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { syncGlazedRoofShadow } from '../roof/glazed-geometry'
import { createGlazedRoofMaterials } from '../roof/glazed-materials'
import { getRoofDebugMaterials, getRoofMaterials } from '../roof/roof-materials'
import { createPlaceholderGeometry } from '../shared/placeholder-geometry'

const ROOF_SLOT_ORDER: readonly RoofSlotId[] = ['fascia', 'gable', 'soffit', 'shingle']

const ROOF_LEGACY_ROLE_BY_SLOT: Record<RoofSlotId, RoofSegmentSurfaceMaterialRole> = {
  fascia: 'edge',
  gable: 'wall',
  soffit: 'wall',
  shingle: 'top',
}

export const RoofSegmentRenderer = ({ node: storedNode }: { node: RoofSegmentNode }) => {
  useLiveNodeOverrides((state) => state.overrides.get(storedNode.id))
  const node = getEffectiveNode(storedNode)
  const glazed = isGlazedRoofSegment(node)
  const ref = useRef<THREE.Mesh>(null!)
  const parentNode = useScene((state) =>
    node.parentId ? (state.nodes[node.parentId as AnyNodeId] as RoofNode | undefined) : undefined,
  )
  const needsSceneMaterials = Boolean(
    (node.slots && Object.keys(node.slots).length > 0) ||
      (parentNode?.slots && Object.keys(parentNode.slots).length > 0) ||
      [
        node.materialPreset,
        node.topMaterialPreset,
        node.edgeMaterialPreset,
        node.wallMaterialPreset,
        node.fasciaMaterialPreset,
        parentNode?.materialPreset,
        parentNode?.topMaterialPreset,
        parentNode?.edgeMaterialPreset,
        parentNode?.wallMaterialPreset,
      ].some((ref) => ref?.startsWith('scene:')),
  )
  const sceneMaterials = useScene((state) => (needsSceneMaterials ? state.materials : undefined))

  useRegistry(node.id, 'roof-segment', ref)
  // The renderer loads lazily, so the scene-load dirty mark can be consumed
  // before this mesh registers. A painted segment is built only from its own
  // mesh (the merged shell skips it), so it would keep its empty placeholder.
  useLayoutEffect(() => {
    useScene.getState().markDirty(node.id)
  }, [node.id])

  const handlers = useNodeEvents(node, 'roof-segment')
  const debugColors = useViewer((s) => s.debugColors)
  const shading = useViewer((s) => s.shading)
  const textures = useViewer((s) => s.textures)
  const colorPreset = useViewer((s) => s.colorPreset)
  const sceneTheme = useViewer((s) => s.sceneTheme)
  // 4 groups map 1:1 to the roof's 4-material array (see getRoofMaterialArray).
  const placeholderGeometry = useMemo(() => createPlaceholderGeometry(4), [])
  const shadowPlaceholder = useMemo(() => createPlaceholderGeometry(1), [])

  // Segment material precedence, per declared slot:
  //   1. Segment slot reference.
  //   2. Segment's legacy role-specific or catch-all material.
  //   3. Parent roof slot reference.
  //   4. Parent roof's legacy role-specific or catch-all material.
  //   5. The themed/catalog default for that slot.
  //
  // The 4-slot layout matches getRoofMaterialArray:
  //   slot 0 → 'edge'  (wall/trim & rake bands)
  //   slot 1 → 'wall'  (deck top & shingle eave bands)
  //   slot 2 → 'wall'  (interior)
  //   slot 3 → 'top'   (shingle / roof surface)
  // The gable band is clad like the walls below it (their assemblies).
  const wallCladdingRef = useScene((state) =>
    parentNode ? levelWallCladdingRef(state.nodes, parentNode) : null,
  )
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps deliberately list the build inputs; depending on the whole object would rebuild on unrelated field changes.
  const customMaterial = useMemo(() => {
    if (glazed) return null
    const resolveSlot = (slotId: RoofSlotId): THREE.Material | null => {
      const segmentRef = node.slots?.[slotId]
      if (segmentRef) {
        const resolved = resolveMaterialRef(segmentRef, sceneMaterials, shading)
        if (resolved) return resolved
      }

      const role = ROOF_LEGACY_ROLE_BY_SLOT[slotId]
      const segmentSpec = getEffectiveSegmentSurfaceMaterial(node, role)
      if (typeof segmentSpec.materialPreset === 'string') {
        const resolved = resolveMaterialRef(segmentSpec.materialPreset, sceneMaterials, shading)
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
        const resolved = resolveMaterialRef(parentSpec.materialPreset, sceneMaterials, shading)
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
      ? getRoofMaterialArray(
          parentNode,
          shading,
          textures,
          colorPreset,
          sceneTheme,
          wallCladdingRef,
          sceneMaterials,
        )
      : null

    const resolved = ROOF_SLOT_ORDER.map((slotId) => resolveSlot(slotId))
    const fasciaSpec = getSegmentFasciaMaterial(node)
    if (!node.slots?.soffit && fasciaSpec) {
      const fascia =
        resolveMaterialRef(fasciaSpec.materialPreset, sceneMaterials, shading) ??
        (fasciaSpec.material !== undefined ? createMaterial(fasciaSpec.material, shading) : null)
      if (fascia) resolved[2] = fascia
    }

    if (!resolved.some((entry) => entry !== null)) {
      return themedArray
    }

    // Some slots have explicit materials; fill the rest from the themed array so
    // an untextured slot still picks up the scene-theme role colour, not blank white.
    // Per-role only, then the themed parent slot — no cross-role fallback, so
    // painting one segment surface never bleeds onto its other surfaces.
    const fallbackAt = (index: number): THREE.Material =>
      themedArray?.[index] ?? new THREE.MeshStandardMaterial()
    return resolved.map((entry, index) => entry ?? fallbackAt(index)) as THREE.Material[]
  }, [
    glazed,
    node.material,
    node.materialPreset,
    node.topMaterial,
    node.topMaterialPreset,
    node.edgeMaterial,
    wallCladdingRef,
    node.edgeMaterialPreset,
    node.wallMaterial,
    node.wallMaterialPreset,
    node.slots,
    node.fasciaMaterial,
    node.fasciaMaterialPreset,
    parentNode,
    sceneMaterials,
    shading,
    textures,
    colorPreset,
    sceneTheme,
  ])

  const { glazing, slots } = node
  const glazingMaterials = useMemo(
    () =>
      glazed
        ? createGlazedRoofMaterials({ glazing, slots }, shading, sceneMaterials, {
            textures,
            colorPreset,
            sceneTheme,
            debugColors,
          })
        : null,
    [
      glazed,
      glazing,
      slots,
      shading,
      sceneMaterials,
      textures,
      colorPreset,
      sceneTheme,
      debugColors,
    ],
  )
  useEffect(
    () => () => {
      for (const material of glazingMaterials?.owned ?? []) material.dispose()
    },
    [glazingMaterials],
  )

  const material =
    glazingMaterials?.visible ??
    (debugColors
      ? getRoofDebugMaterials(shading)
      : customMaterial || getRoofMaterials(shading, textures, colorPreset))

  useLayoutEffect(() => {
    if (glazed && ref.current) syncGlazedRoofShadow(ref.current, material)
  }, [glazed, material])

  useEffect(() => {
    return () => {
      placeholderGeometry.dispose()
      shadowPlaceholder.dispose()
    }
  }, [placeholderGeometry, shadowPlaceholder])

  return (
    <mesh
      castShadow={!glazed}
      receiveShadow
      geometry={placeholderGeometry}
      material={material}
      position={node.position}
      ref={ref}
      rotation-y={node.rotation}
      visible={node.visible}
      {...handlers}
    >
      <mesh
        name="glazed-roof-shadow"
        userData={{ aedifexExport: 'strip' }}
        geometry={shadowPlaceholder}
        layers={SHADOW_ONLY_LAYER}
        castShadow
        visible={glazed}
        raycast={() => {}}
      >
        <meshBasicMaterial />
      </mesh>
    </mesh>
  )
}

export default RoofSegmentRenderer
