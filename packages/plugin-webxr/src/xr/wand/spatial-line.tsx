'use client'

import { LineBasicNodeMaterial } from 'three/webgpu'
import { XR_PANEL_RENDER_ORDER } from './theme'
import { useSpatialScroll } from './spatial-scroll'
import { useWebXRSceneLayers } from '../layers'
import { useEffect, useMemo } from 'react'
import { BufferGeometry, LineBasicMaterial, type Shape, Line as ThreeLine, Vector3 } from 'three'

export function shapeLinePoints(shape: Shape) {
  const points = shape.getPoints(6).map(({ x, y }) => [x, y, 0.007] as [number, number, number])
  points.push(points[0]!)
  return points
}

export function SpatialLine({
  color,
  lineWidth = 1,
  opacity = 1,
  points,
  renderOrder = 5,
  transparent = false,
}: {
  color: string
  lineWidth?: number
  opacity?: number
  points: readonly [number, number, number][]
  renderOrder?: number
  transparent?: boolean
}) {
  const scroll = useSpatialScroll()
  const { overlay } = useWebXRSceneLayers()
  const pointKey = points.map((point) => point.join(',')).join(';')
  const line = useMemo(
    () =>
      new ThreeLine(
        new BufferGeometry().setFromPoints(points.map(([x, y, z]) => new Vector3(x, y, z))),
        new (scroll ? LineBasicNodeMaterial : LineBasicMaterial)({
          ...(scroll ? { maskNode: scroll.maskNode } : {}),
          color,
          linewidth: lineWidth,
          opacity,
          transparent: true,
        }),
      ),
    [color, lineWidth, opacity, pointKey, transparent, scroll?.maskNode],
  )

  useEffect(
    () => () => {
      line.geometry.dispose()
      line.material.dispose()
    },
    [line],
  )

  line.layers.set(overlay)
  line.renderOrder = XR_PANEL_RENDER_ORDER + renderOrder
  return <primitive object={line} raycast={() => undefined} />
}
