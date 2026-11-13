import { type AnyNodeId, emitter, useScene } from '@aedifex/core'
import { beginGesture, type GestureHandle, markToolCancelConsumed } from '@aedifex/editor'
import { useEffect, useRef } from 'react'

export function useMepHandleGesture() {
  const active = useRef<GestureHandle | null>(null)
  useEffect(() => () => active.current?.cancel('unmount'), [])
  return (nodeId: string, handle: string, onCancel: () => void) => {
    const gesture = beginGesture({
      kind: 'handle-drag',
      scope: { kind: 'handle-drag', nodeId, handle },
      stale: () => !useScene.getState().nodes[nodeId as AnyNodeId],
      onCancel,
    })
    active.current = gesture
    const cancel = () => {
      markToolCancelConsumed()
      gesture.cancel('cancel')
    }
    emitter.on('tool:cancel', cancel)
    return () => {
      emitter.off('tool:cancel', cancel)
      gesture.end()
      if (active.current === gesture) active.current = null
    }
  }
}
