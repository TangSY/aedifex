'use client'

import { createContext, type ReactNode, useContext } from 'react'

export type WebXRSceneLayers = {
  batched: number
  overlay: number
  zone: number
}

export const DEFAULT_WEBXR_SCENE_LAYERS: WebXRSceneLayers = {
  batched: 5,
  overlay: 1,
  zone: 2,
}

const WebXRSceneLayersContext = createContext(DEFAULT_WEBXR_SCENE_LAYERS)

export function WebXRSceneLayersProvider({
  children,
  layers,
}: {
  children: ReactNode
  layers: WebXRSceneLayers
}) {
  return (
    <WebXRSceneLayersContext.Provider value={layers}>
      {children}
    </WebXRSceneLayersContext.Provider>
  )
}

export function useWebXRSceneLayers() {
  return useContext(WebXRSceneLayersContext)
}
