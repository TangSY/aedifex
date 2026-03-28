import { type DoorNode, useRegistry, useScene } from '@aedifex/core'
import { useLayoutEffect, useRef } from 'react'
import type { Mesh } from 'three'
import { useNodeEvents } from '../../../hooks/use-node-events'

export const DoorRenderer = ({ node }: { node: DoorNode }) => {
  const ref = useRef<Mesh>(null!)

  useRegistry(node.id, 'door', ref)

  // Mark dirty on mount so DoorSystem rebuilds geometry when door (re)appears
  useLayoutEffect(() => {
    useScene.getState().markDirty(node.id)
  }, [node.id])

  const handlers = useNodeEvents(node, 'door')
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
      {/* DoorSystem replaces this geometry each time the node is dirty */}
      <boxGeometry args={[0, 0, 0]} />
      <meshStandardMaterial color="#d1d5db" />
    </mesh>
  )
}
