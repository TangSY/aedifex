'use client'

import type { ComponentType, ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  mountEmulatedViewerOverlay,
  mountEmulatorControls,
  requestWebXRSession,
  useWebXRRuntime,
  waitForViewerResize,
} from './runtime'
import type { WebXRStore } from './runtime'
import { GOD_ORIGIN_POSITION, GOD_ORIGIN_ROTATION } from './xr/god-mode'
import type { WebXRSceneLayers } from './xr/layers'
import { PlayerModeScene } from './xr/mode-switching'
import type { StandingSceneProvider } from './xr/mode-switching/lib/standing-destination'
import { WebXRSessionRoot } from './xr/session-root'
import type { XRQualityPreset } from './xr/frame-loop'
import { useWebXRSessionControls } from './session-controls'

type WrapperProps = { children: ReactNode }

export function createWebXRViewerSession(
  store: WebXRStore,
  session: XRSession,
  inputSourceOverlay?: ComponentType<{ type: 'controller' | 'hand' }>,
  sceneContent?: ReactNode,
  layers?: WebXRSceneLayers,
  onError?: (cause: unknown) => void,
  uiContent?: ReactNode,
  qualityPreset: XRQualityPreset = 'balanced',
  standingScene?: StandingSceneProvider,
) {
  return {
    onError,
    Session: function Session({ children }: WrapperProps) {
      return (
        <WebXRSessionRoot
          onError={onError}
          originPosition={GOD_ORIGIN_POSITION.toArray()}
          originRotation={[GOD_ORIGIN_ROTATION.x, GOD_ORIGIN_ROTATION.y, GOD_ORIGIN_ROTATION.z]}
          session={session}
          store={store}
          qualityPreset={qualityPreset}
        >
          {children}
        </WebXRSessionRoot>
      )
    },
    Scene: function Scene({ children }: WrapperProps) {
      return (
        <PlayerModeScene
          inputSourceOverlay={inputSourceOverlay}
          layers={layers}
          store={store}
          uiContent={uiContent}
          standingScene={standingScene}
        >
          {children}
          {sceneContent}
        </PlayerModeScene>
      )
    },
  }
}

export function useWebXRSession(qualityPreset: XRQualityPreset = 'balanced') {
  const runtime = useWebXRRuntime(true)
  const [session, setSession] = useState<XRSession>()
  const [entering, setEntering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const activeSession = useRef<XRSession | undefined>(undefined)
  const pending = useRef(false)
  const lifetime = useRef<object | null>(null)
  const restoreViewer = useRef<(() => void) | null>(null)

  useEffect(() => {
    lifetime.current = {}
    return () => {
      lifetime.current = null
      const active = activeSession.current
      activeSession.current = undefined
      if (active) void active.end().catch(() => undefined)
      restoreViewer.current?.()
      restoreViewer.current = null
    }
  }, [])

  useEffect(() => {
    if (session && runtime.status === 'ready' && runtime.source === 'emulated') {
      return mountEmulatorControls()
    }
  }, [runtime, session])

  const enter = useCallback(async () => {
    if (runtime.status !== 'ready' || pending.current || activeSession.current) return
    const owner = lifetime.current
    pending.current = true
    setEntering(true)
    setError(null)
    try {
      // The platform is prepared before the click so requestSession retains
      // the browser's user activation on native headsets.
      const next = await requestWebXRSession(runtime.store)
      if (lifetime.current !== owner || !owner) {
        await next.end()
        return
      }
      activeSession.current = next
      if (runtime.source === 'emulated') {
        restoreViewer.current = mountEmulatedViewerOverlay()
        await waitForViewerResize()
      }
      next.addEventListener(
        'end',
        () => {
          if (activeSession.current !== next) return
          activeSession.current = undefined
          restoreViewer.current?.()
          restoreViewer.current = null
          setSession(undefined)
        },
        { once: true },
      )
      setSession(next)
    } catch (cause) {
      if (lifetime.current === owner) {
        setError(cause instanceof Error ? cause.message : 'Could not enter VR')
      }
    } finally {
      pending.current = false
      if (lifetime.current === owner) setEntering(false)
    }
  }, [runtime])

  const exit = useCallback(async () => {
    try {
      await activeSession.current?.end()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not exit VR')
    }
  }, [])

  const fail = useCallback((cause: unknown) => {
    setError(cause instanceof Error ? cause.message : 'The VR session could not render')
    void activeSession.current?.end().catch(() => undefined)
  }, [])

  const immersive = useMemo(
    () =>
      runtime.status === 'ready' && session
        ? createWebXRViewerSession(runtime.store, session, undefined, undefined, undefined, fail, undefined, qualityPreset)
        : undefined,
    [fail, qualityPreset, runtime, session],
  )

  const ready = runtime.status === 'ready'
  const unavailable = runtime.status === 'unsupported'
  const sessionError = error ?? (runtime.status === 'error'
    ? runtime.message
    : runtime.status === 'unsupported'
      ? 'Immersive VR is unavailable. Connect a headset and open the editor over HTTPS.'
      : null)
  const controlsOwner = useRef({})
  useEffect(() => {
    useWebXRSessionControls.getState().publish(controlsOwner.current, {
      ready, unavailable, active: !!session, entering, error: sessionError, enter, exit,
    })
  }, [ready, unavailable, session, entering, sessionError, enter, exit])
  useEffect(() => {
    const owner = controlsOwner.current
    return () => useWebXRSessionControls.getState().clear(owner)
  }, [])

  return { enter, exit, entering, fail, immersive, runtime, session, ready, error: sessionError }
}
