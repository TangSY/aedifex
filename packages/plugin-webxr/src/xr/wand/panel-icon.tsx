'use client'

import { SpatialMaterial } from './spatial-material'

import { useWebXRSceneLayers } from '../layers'
import { useTexture } from '@react-three/drei'
import { Component, type ReactNode, Suspense, useMemo } from 'react'
import { SRGBColorSpace } from 'three'
import { texture as textureNode, uniform, mix, vec3, vec4 } from 'three/tsl'
import { XR_PANEL_RENDER_ORDER, XR_WAND_THEME } from './theme'

function TextureIcon({ positionY, size, src, muted }: { positionY: number; size: number; src: string; muted: boolean }) {
  const { overlay } = useWebXRSceneLayers()
  const texture = useTexture(src)
  texture.colorSpace = SRGBColorSpace
  const { colorNode, saturation } = useMemo(() => {
    const sample = textureNode(texture)
    const saturation = uniform(1)
    const gray = vec3(sample.rgb.dot(vec3(0.2126, 0.7152, 0.0722)))
    return { colorNode: vec4(mix(gray, sample.rgb, saturation), sample.a), saturation }
  }, [texture])
  // Update the existing shader instead of replacing its graph on selection.
  saturation.value = muted ? 0 : 1
  const image = texture.image as { width?: number; height?: number }
  const aspect = (image?.width || 1) / (image?.height || 1)
  const width = size * Math.min(1, aspect)
  const height = size / Math.max(1, aspect)
  return (
    <mesh
      layers={overlay}
      position={[0, positionY, 0.012]}
      renderOrder={XR_PANEL_RENDER_ORDER + 6}
      raycast={() => undefined}
    >
      <planeGeometry args={[width, height]} />
      <SpatialMaterial alphaTest={0.05} map={texture} colorNode={colorNode} opacity={muted ? 0.7 : 1} toneMapped={false} transparent />
    </mesh>
  )
}

function ColorIcon({ color, positionY, size }: { color: string; positionY: number; size: number }) {
  const { overlay } = useWebXRSceneLayers()
  return (
    <mesh
      layers={overlay}
      position={[0, positionY, 0.012]}
      renderOrder={XR_PANEL_RENDER_ORDER + 6}
      raycast={() => undefined}
    >
      <planeGeometry args={[size, size]} />
      <SpatialMaterial color={color} toneMapped={false} transparent />
    </mesh>
  )
}

type TextureIconBoundaryProps = {
  children: ReactNode
  fallback: ReactNode
}

type TextureIconBoundaryState = {
  hasError: boolean
}

class TextureIconBoundary extends Component<TextureIconBoundaryProps, TextureIconBoundaryState> {
  state: TextureIconBoundaryState = { hasError: false }

  static getDerivedStateFromError(): TextureIconBoundaryState {
    return { hasError: true }
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children
  }
}

export function PanelIcon({
  color = XR_WAND_THEME.border,
  positionY = 0.022,
  size = 0.09,
  src,
  muted = false,
}: {
  color?: string
  positionY?: number
  size?: number
  src?: string
  muted?: boolean
}) {
  if (!src) {
    return <ColorIcon color={muted ? XR_WAND_THEME.muted : color} positionY={positionY} size={size} />
  }

  const fallback = <ColorIcon color={muted ? XR_WAND_THEME.muted : color} positionY={positionY} size={size} />
  return (
    <TextureIconBoundary fallback={fallback} key={src}>
      <Suspense fallback={fallback}>
        <TextureIcon positionY={positionY} size={size} src={src} muted={muted} />
      </Suspense>
    </TextureIconBoundary>
  )
}
