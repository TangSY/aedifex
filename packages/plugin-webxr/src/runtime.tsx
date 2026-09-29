'use client'

import { useScene } from '@aedifex/core'
import { createXRStore, type XRStore, type XRStoreOptions } from '@react-three/xr'
import type { XRDevice } from 'iwer'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { GOD_ORIGIN_POSITION } from './xr/god-mode'
import { VisibleXRController, VisibleXRHand } from './xr/input-visuals'
import { PlayerModeScene } from './xr/mode-switching'
import { WebXRSessionRoot } from './xr/session-root'

export { VisibleXRController, VisibleXRHand } from './xr/input-visuals'

export const WEBXR_PLUGIN_ID = 'webxr:core'

export type XRRuntimeSource = 'native' | 'emulated' | 'unsupported'
type RuntimeStatus = 'idle' | 'entering' | 'active' | 'error'

type EmulatedDevice = XRDevice & {
  appCanvas?: HTMLCanvasElement
  canvasContainer: HTMLDivElement
  devui?: {
    devUICanvas: HTMLCanvasElement
    devUIContainer: HTMLDivElement
  }
}

type RuntimeGlobal = typeof globalThis & {
  __webXRPluginDevice?: EmulatedDevice
  __webXRPluginSetup?: Promise<XRRuntimeSource>
}

export type WebXRStore = XRStore
export type WebXRStoreFactory = () => WebXRStore

export type WebXRFeature = {
  enabled: boolean
  enter: () => Promise<void>
  error: string | null
  exit: () => Promise<void>
  inputSources: readonly string[]
  status: RuntimeStatus
  xr?: WebXRViewerConfig
}

export type WebXRViewerConfig = {
  multiview: false
  originPosition?: [number, number, number]
  playerModes: boolean
  sceneWrapper?: typeof PlayerModeScene
  sessionRoot: typeof WebXRSessionRoot
  session: XRSession
  store: WebXRStore
}

export type WebXRRuntimeState =
  | { status: 'idle' | 'loading' }
  | { message: string; status: 'error' }
  | { source: Exclude<XRRuntimeSource, 'unsupported'>; status: 'ready'; store: WebXRStore }
  | { status: 'unsupported' }

// Native headsets and IWER supply standing eye height. This offset only moves
// the player along the floor so the initial view starts outside the model.
export const WEBXR_ORIGIN_POSITION: [number, number, number] = [0, 0, 8]

export function createWebXRStore(options: XRStoreOptions = {}): WebXRStore {
  return createXRStore({
    emulate: false,
    controller: VisibleXRController,
    hand: VisibleXRHand,
    offerSession: false,
    ...options,
  })
}

export function resolveRuntimeSource({
  development,
  nativeSupported,
}: {
  development: boolean
  nativeSupported: boolean
}): XRRuntimeSource {
  if (nativeSupported) return 'native'
  return development ? 'emulated' : 'unsupported'
}

export async function getImmersiveVRSupport(): Promise<'supported' | 'unsupported'> {
  if (typeof navigator === 'undefined' || !navigator.xr) return 'unsupported'

  try {
    return (await navigator.xr.isSessionSupported('immersive-vr')) ? 'supported' : 'unsupported'
  } catch {
    return 'unsupported'
  }
}

export function getEmulatedXRDevice(): XRDevice | undefined {
  return (globalThis as RuntimeGlobal).__webXRPluginDevice
}

export function mountEmulatedViewerOverlay(): () => void {
  const viewer = document.querySelector<HTMLElement>('[data-aedifex-viewer-3d]')
  if (!viewer) return () => undefined
  const previousStyle = viewer.getAttribute('style')
  Object.assign(viewer.style, {
    display: 'block',
    height: '100vh',
    inset: '0',
    position: 'fixed',
    width: '100vw',
    zIndex: '998',
  })
  window.dispatchEvent(new Event('resize'))
  return () => {
    if (previousStyle === null) viewer.removeAttribute('style')
    else viewer.setAttribute('style', previousStyle)
    window.dispatchEvent(new Event('resize'))
  }
}

export function waitForViewerResize(): Promise<void> {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  )
}

export function prepareXRPlatform(): Promise<XRRuntimeSource> {
  const runtimeGlobal = globalThis as RuntimeGlobal
  runtimeGlobal.__webXRPluginSetup ??= setupXRPlatform().catch((error: unknown) => {
    delete runtimeGlobal.__webXRPluginSetup
    throw error
  })
  return runtimeGlobal.__webXRPluginSetup
}

async function setupXRPlatform(): Promise<XRRuntimeSource> {
  const nativeSupported = (await getImmersiveVRSupport()) === 'supported'
  const source = resolveRuntimeSource({
    development: process.env.NODE_ENV !== 'production',
    nativeSupported,
  })
  if (source !== 'emulated') return source

  const [{ XRDevice, metaQuest3 }, { DevUI }] = await Promise.all([
    import('iwer'),
    import('@iwer/devui'),
  ])
  const device = new XRDevice(metaQuest3) as EmulatedDevice
  device.installRuntime({ forceInstall: true })
  device.installDevUI(DevUI)
  ;(globalThis as RuntimeGlobal).__webXRPluginDevice = device

  return (await getImmersiveVRSupport()) === 'supported' ? 'emulated' : 'unsupported'
}

export function mountEmulatorControls(): () => void {
  const device = (globalThis as RuntimeGlobal).__webXRPluginDevice
  const devui = device?.devui
  if (!(device && devui)) return () => undefined

  const host = device.canvasContainer
  Object.assign(host.style, {
    display: 'block',
    height: '100vh',
    inset: '0',
    width: '100vw',
  })
  const mountedHost = !host.isConnected
  const mountedCanvas = !devui.devUICanvas.isConnected
  const mountedControls = !devui.devUIContainer.isConnected

  if (mountedCanvas) host.appendChild(devui.devUICanvas)
  if (mountedControls) host.appendChild(devui.devUIContainer)
  if (mountedHost) document.body.appendChild(host)

  // IWER reparents the renderer canvas into its fullscreen host, but preserves
  // the CSS pixel size assigned by the editor's viewer pane. Stretch only the
  // application canvas so its stereo image fills the emulated headset viewport.
  let appCanvas: HTMLCanvasElement | undefined
  let previousCanvasStyle: string | null = null
  const fillViewport = () => {
    const nextCanvas = device.appCanvas
    if (!nextCanvas || nextCanvas === appCanvas) return
    appCanvas = nextCanvas
    previousCanvasStyle = appCanvas.getAttribute('style')
    Object.assign(appCanvas.style, {
      height: '100vh',
      inset: '0',
      position: 'absolute',
      width: '100vw',
    })
  }
  fillViewport()
  const canvasObserver = new MutationObserver(fillViewport)
  canvasObserver.observe(host, { childList: true })

  return () => {
    canvasObserver.disconnect()
    if (appCanvas) {
      if (previousCanvasStyle === null) appCanvas.removeAttribute('style')
      else appCanvas.setAttribute('style', previousCanvasStyle)
    }
    if (mountedCanvas && devui.devUICanvas.parentElement === host) devui.devUICanvas.remove()
    if (mountedControls && devui.devUIContainer.parentElement === host) {
      devui.devUIContainer.remove()
    }
    if (mountedHost && host.isConnected && host.childElementCount === 0) host.remove()
  }
}

export function useWebXRRuntime(enabled: boolean): WebXRRuntimeState {
  const [runtime, setRuntime] = useState<WebXRRuntimeState>({ status: 'idle' })

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    let store: WebXRStore | undefined
    setRuntime({ status: 'loading' })
    prepareXRPlatform()
      .then((source) => {
        if (cancelled) return
        if (source === 'unsupported') {
          setRuntime({ status: 'unsupported' })
          return
        }
        store = createWebXRStore({ layers: false })
        setRuntime({ source, status: 'ready', store })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setRuntime({
          message: error instanceof Error ? error.message : 'Could not initialize WebXR',
          status: 'error',
        })
      })

    return () => {
      cancelled = true
      store?.destroy()
    }
  }, [enabled])

  return runtime
}

export async function requestWebXRSession(store: WebXRStore): Promise<XRSession> {
  if (!navigator.xr) throw new Error('Immersive VR is unavailable')

  const domOverlayRoot = store.getState().domOverlayRoot
  return navigator.xr.requestSession('immersive-vr', {
    requiredFeatures: ['local-floor'],
    optionalFeatures: [
      'anchors',
      'dom-overlay',
      'hand-tracking',
      'hit-test',
      'mesh-detection',
      'plane-detection',
    ],
    ...(domOverlayRoot ? { domOverlay: { root: domOverlayRoot } } : {}),
  })
}

export function webXRViewerConfig(
  runtime: WebXRRuntimeState,
  session?: XRSession,
): WebXRViewerConfig | undefined {
  return runtime.status === 'ready' && session
    ? {
        multiview: false,
        originPosition: GOD_ORIGIN_POSITION.toArray(),
        playerModes: true,
        sceneWrapper: PlayerModeScene,
        session,
        sessionRoot: WebXRSessionRoot,
        store: runtime.store,
      }
    : undefined
}

export function useWebXRFeature(createStore: WebXRStoreFactory = createWebXRStore): WebXRFeature {
  const enabled = useScene((state) =>
    ((state as typeof state & { installedPlugins?: string[] }).installedPlugins ?? []).includes(
      WEBXR_PLUGIN_ID,
    ),
  )
  const [store] = useState<WebXRStore>(createStore)
  const [session, setSession] = useState<XRSession>()
  const [source, setSource] = useState<Exclude<XRRuntimeSource, 'unsupported'>>()
  const [status, setStatus] = useState<RuntimeStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const restoreViewer = useRef<(() => void) | null>(null)
  const inputSourceStates = useSyncExternalStore(
    store.subscribe,
    () => store.getState().inputSourceStates,
    () => store.getState().inputSourceStates,
  )
  const inputSources = useMemo(
    () =>
      inputSourceStates.map((state) => `${state.type}:${state.inputSource.handedness || 'none'}`),
    [inputSourceStates],
  )

  useEffect(() => {
    if (!(session && source === 'emulated')) return
    return mountEmulatorControls()
  }, [session, source])

  useEffect(() => {
    if (!session) return
    const ended = () => {
      restoreViewer.current?.()
      restoreViewer.current = null
      setSession(undefined)
      setStatus('idle')
    }
    session.addEventListener('end', ended, { once: true })
    return () => session.removeEventListener('end', ended)
  }, [session])

  useEffect(() => {
    if (enabled || !session) return
    void session.end()
  }, [enabled, session])

  const enter = useCallback(async () => {
    if (!(enabled && status !== 'entering') || session) return
    setStatus('entering')
    setError(null)
    try {
      const runtimeSource = await prepareXRPlatform()
      if (runtimeSource === 'unsupported') {
        throw new Error('Immersive VR is unavailable. Connect a headset and enable WebXR.')
      }
      const nextSession = await requestWebXRSession(store)
      if (runtimeSource === 'emulated') {
        const restore = mountEmulatedViewerOverlay()
        restoreViewer.current = restore
        await waitForViewerResize()
      }
      setSource(runtimeSource)
      setSession(nextSession)
      setStatus('active')
    } catch (cause) {
      setStatus('error')
      setError(cause instanceof Error ? cause.message : 'Could not enter immersive VR.')
    }
  }, [enabled, session, status, store])

  const exit = useCallback(async () => {
    if (session) await session.end()
  }, [session])

  const xr = useMemo<WebXRViewerConfig | undefined>(
    () =>
      session
        ? {
            multiview: false,
            originPosition: WEBXR_ORIGIN_POSITION,
            playerModes: false,
            session,
            sessionRoot: WebXRSessionRoot,
            store,
          }
        : undefined,
    [session, store],
  )

  return { enabled, enter, error, exit, inputSources, status, xr }
}
