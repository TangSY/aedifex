'use client'

import { useScene } from '@aedifex/editor'
import { WEBXR_PLUGIN_ID } from '../../../runtime'
import { useAedifexWebXR } from '../inline-session'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { webXRWandBindings } from './webxr-wand-bindings'

export type AedifexWebXRFeature = ReturnType<typeof useAedifexWebXR>

const WebXRFeatureContext = createContext<AedifexWebXRFeature | null>(null)

function EnabledWebXRFeature({
  onFeature,
}: {
  onFeature: (feature: AedifexWebXRFeature | null) => void
}) {
  const feature = useAedifexWebXR(webXRWandBindings)
  // Keep the context stable when the plugin returns a new aggregate object.
  // biome-ignore lint/correctness/useExhaustiveDependencies: stabilize on public feature fields
  const stableFeature = useMemo(
    () => feature,
    [
      feature.enter,
      feature.entering,
      feature.error,
      feature.exit,
      feature.immersive,
      feature.ready,
      feature.runtime,
      feature.session,
    ],
  )

  useEffect(() => {
    onFeature(stableFeature)
    return () => onFeature(null)
  }, [onFeature, stableFeature])

  return null
}

export function WebXRFeatureRuntime({
  enabled,
  children,
}: {
  enabled: boolean
  children: ReactNode
}) {
  const [feature, setFeature] = useState<AedifexWebXRFeature | null>(null)
  const setFeatureStable = useCallback((next: AedifexWebXRFeature | null) => setFeature(next), [])

  return (
    <WebXRFeatureContext.Provider value={enabled ? feature : null}>
      {children}
      {enabled ? <EnabledWebXRFeature onFeature={setFeatureStable} /> : null}
    </WebXRFeatureContext.Provider>
  )
}

export function WebXRFeatureConsumer({
  children,
}: {
  children: (feature: AedifexWebXRFeature | null) => ReactNode
}) {
  return children(useContext(WebXRFeatureContext))
}

export function useWebXRInstalled() {
  return useScene((state) => state.installedPlugins.includes(WEBXR_PLUGIN_ID))
}
