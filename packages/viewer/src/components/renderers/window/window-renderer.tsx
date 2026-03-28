import { useRegistry, useScene, type WindowNode } from '@aedifex/core'
import { useLayoutEffect, useRef } from 'react'
import type { Mesh } from 'three'
import { useNodeEvents } from '../../../hooks/use-node-events'

export const WindowRenderer = ({ node }: { node: WindowNode }) => {
  const ref = useRef<Mesh>(null!)

  useRegistry(node.id, 'window', ref)

  // Mark dirty on mount so WindowSystem rebuilds geometry when window (re)appears
  useLayoutEffect(() => {
    useScene.getState().markDirty(node.id)
  }, [node.id])

  const handlers = useNodeEvents(node, 'window')
  const isTransient = !!(node.metadata as Record<string, unknown> | null)?.isTransient

  return (
    <mesh
      castShadow
      position={node.position}
      receiveShadow
      ref={ref}
      rotation={node.rotation}
      visible={node.visible}
      {...(isTransient ? {} : handlers)}
    >
      {/* WindowSystem replaces this geometry each time the node is dirty */}
      <boxGeometry args={[0, 0, 0]} />
      <meshStandardMaterial color="#d1d5db" />
    </mesh>
  )
}
