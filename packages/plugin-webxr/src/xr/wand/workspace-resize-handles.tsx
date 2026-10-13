'use client'

import type { ThreeEvent } from '@react-three/fiber'
import { useState } from 'react'
import { useWebXRSceneLayers } from '../layers'
import { XR_WAND_THEME } from './theme'

type PointerHandler = (event: ThreeEvent<PointerEvent>) => void

export function WorkspaceResizeHandles({ active, onStart, onMove, onEnd }: {
  active: string | null
  onStart: PointerHandler
  onMove: PointerHandler
  onEnd: PointerHandler
}) {
  const { overlay } = useWebXRSceneLayers()
  const [hovered, setHovered] = useState<string | null>(null)
  const name = 'xr-workspace-resize-left-top'
  const highlighted = active === name || hovered === name
  const color = highlighted ? XR_WAND_THEME.accent : '#ffffff'
  const opacity = highlighted ? 1 : 0.3
  return <mesh
    name={name}
    layers={overlay}
    position={[-0.94, 0.58, 0.014]}
    onPointerEnter={() => setHovered(name)}
    onPointerLeave={() => setHovered(current => current === name ? null : current)}
    onPointerDown={onStart}
    onPointerMove={onMove}
    onPointerUp={onEnd}
    onPointerCancel={onEnd}
    onClick={event => event.stopPropagation()}
  >
    <planeGeometry args={[0.12, 0.12]} />
    <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    <group scale={[-1, 1, 1]}>
      <mesh layers={overlay} position={[-0.025, -0.025, 0]} raycast={() => null}>
        <torusGeometry args={[0.04, 0.005, 6, 16, Math.PI / 2]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} />
      </mesh>
      <mesh layers={overlay} position={[0.015, -0.045, 0]} raycast={() => null}>
        <capsuleGeometry args={[0.005, 0.04, 4, 8]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} />
      </mesh>
      <mesh layers={overlay} position={[-0.045, 0.015, 0]} rotation={[0, 0, Math.PI / 2]} raycast={() => null}>
        <capsuleGeometry args={[0.005, 0.04, 4, 8]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} />
      </mesh>
    </group>
  </mesh>
}
