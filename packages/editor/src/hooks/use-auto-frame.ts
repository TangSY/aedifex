'use client'

import { useScene } from '@aedifex/core'
import type { AnyNode } from '@aedifex/core/schema'
import { useEffect, useRef } from 'react'
import { computeSceneBoundsXZ, type SceneBoundsXZ } from '../lib/scene-bounds'

type AutoFrameListener = (bounds: SceneBoundsXZ | null) => void
const listeners = new Set<AutoFrameListener>()

export function requestAutoFrame(nodes: Record<string, AnyNode>) {
  const bounds = computeSceneBoundsXZ(nodes)
  for (const listener of listeners) listener(bounds)
}

export function subscribeAutoFrame(listener: AutoFrameListener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Auto-frame the camera onto a freshly loaded scene.
 *
 * Motivation: when the MCP `setScene` tool (or any other entry point) swaps
 * the scene graph while the default camera is pointing at empty space, the
 * user sees a black viewport. This hook subscribes to the core scene store
 * and, whenever `nodes` transitions from empty → non-empty, computes the
 * XZ bounds of the new scene and notifies the editor's camera controls.
 * This internal notification does not count as a person taking the camera.
 *
 * Mount in exactly ONE component (the Editor). It holds no state of its own;
 * the subscription is torn down on unmount.
 */
export function useAutoFrame({
  enabled = true,
  ready = false,
  readyKey = 0,
  deferReady = false,
  suppressReady = false,
}: {
  enabled?: boolean
  ready?: boolean
  readyKey?: number
  deferReady?: boolean
  suppressReady?: boolean
} = {}): void {
  // Track the previous node count so we can detect the empty → non-empty edge.
  const wasEmptyRef = useRef(true)
  const framedReadyKey = useRef<number | null>(null)

  useEffect(() => {
    // Initialise from current store state so a remount after a setScene
    // doesn't re-frame an already-populated scene.
    wasEmptyRef.current = Object.keys(useScene.getState().nodes).length === 0

    const unsubscribe = useScene.subscribe((state) => {
      const isEmpty = Object.keys(state.nodes).length === 0
      const wasEmpty = wasEmptyRef.current
      wasEmptyRef.current = isEmpty

      // Only react to empty → non-empty transitions. Normal edits keep both
      // flags false; a `clearScene()` goes non-empty → empty and is ignored.
      if (!enabled || !wasEmpty || isEmpty) return
      requestAutoFrame(state.nodes)
    })

    return unsubscribe
  }, [enabled])

  useEffect(() => {
    if (!ready || !readyKey || deferReady || framedReadyKey.current === readyKey) return
    framedReadyKey.current = readyKey
    if (!suppressReady) requestAutoFrame(useScene.getState().nodes)
  }, [deferReady, ready, readyKey, suppressReady])
}
