'use client'

import { useEffect, useMemo } from 'react'
import type { MeshBasicMaterialParameters } from 'three'
import { MeshBasicNodeMaterial, type Node } from 'three/webgpu'
import { useSpatialScroll } from './spatial-scroll'

export function SpatialMaterial({ colorNode, ...props }: MeshBasicMaterialParameters & { colorNode?: Node }) {
  const scroll = useSpatialScroll()
  const needsNodeMaterial = scroll !== null || colorNode != null
  const material = useMemo(() => (needsNodeMaterial ? new MeshBasicNodeMaterial() : null), [needsNodeMaterial])
  useEffect(() => () => material?.dispose(), [material])
  if (!material) return <meshBasicMaterial {...props} />
  // Clip in world space so both XR eyes use the same viewport boundaries.
  return <primitive object={material} attach="material" {...props} colorNode={colorNode ?? null} maskNode={scroll?.maskNode ?? null} />
}
