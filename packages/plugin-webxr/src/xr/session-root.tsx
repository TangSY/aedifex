'use client'

import { supportEmulatedDefaultFramebuffer } from './emulated-framebuffer'
import { advance, useStore, useThree } from '@react-three/fiber'
import { XR, XROrigin, type XRStore } from '@react-three/xr'
import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import {
  advanceXRFrameWithoutDesktopRender,
  configureXRQuality,
  createXRFrameClock,
  ownsXRFrameLoopBinding,
  renderImmersiveXRFrame,
  stopXRFrameLoop,
  takeOverXRFrameLoop,
  type XRFrameLoopRenderer,
  type XRQualityPreset,
} from './frame-loop'

function configureWebGLXRBaseLayer(manager: { [key: string]: unknown }) {
  // Three prefers XRProjectionLayer whenever a partial XRWebGLBinding exists.
  // IWER exposes that binding but drives input frames from XRWebGLLayer, so
  // projection-layer selection leaves the session without a base layer.
  if ('_supportsLayers' in manager) manager._supportsLayers = false
}

export const WEBXR_CAMERA_NEAR = 0.1
export const WEBXR_CAMERA_FAR = 10_000

function applyWebXRCameraClipping(camera: {
  far: number
  near: number
  updateProjectionMatrix(): void
}) {
  camera.far = WEBXR_CAMERA_FAR
  camera.near = WEBXR_CAMERA_NEAR
  camera.updateProjectionMatrix()
}

function XRSessionBinding({
  session,
  store,
  onError,
  qualityPreset,
}: {
  session?: XRSession
  store: XRStore
  onError?: (cause: unknown) => void
  qualityPreset?: XRQualityPreset
}) {
  const renderer = useThree((state) => state.gl)
  const r3fXR = useThree((state) => state.xr)
  const rootStore = useStore()
  const activeBinding = useRef<symbol | null>(null)

  useEffect(() => {
    const manager = renderer.xr
    if (!session) return

    let cancelled = false
    let attached = false
    let restoreFrameLoop: (() => void) | undefined
    let resyncInputsOnNextFrame = false
    let restoreDrawBuffers: (() => void) | undefined
    let removeEmulatorResize: (() => void) | undefined

    const binding = Symbol('xr-session-binding')
    activeBinding.current = binding
    const state = rootStore.getState()
    const baseCamera = state.camera
    configureXRQuality(renderer as never, qualityPreset ?? 'balanced')
    const frameClock = createXRFrameClock(state.clock.elapsedTime)

    let failed = false
    const fail = (error: unknown) => {
      if (cancelled || failed) return
      failed = true
      console.error('[webxr-plugin] Could not render the WebXR session', error)
      onError?.(error)
      void session.end().catch(() => undefined)
    }
    const attachSession = async () => {
      // Attach the session before starting the renderer-owned loop. IWER
      // publishes input sources on its first frame; starting the loop first
      // can race @react-three/xr's session synchronization and leave the
      // store with a session but no controllers or hands.
      r3fXR?.disconnect()
      configureWebGLXRBaseLayer(manager as unknown as { [key: string]: unknown })
      const restore = await takeOverXRFrameLoop(
        renderer as unknown as XRFrameLoopRenderer,
        r3fXR,
        (time, frame) => {
          if (!frame || !attached || cancelled || failed) return
          try {
            if (resyncInputsOnNextFrame) {
              resyncInputsOnNextFrame = false
              const xrState = store.getState()
              if (
                xrState.session !== session ||
                (xrState.inputSourceStates.length === 0 && session.inputSources.length > 0)
              ) {
                // IWER publishes its initial controllers on the first immersive
                // frame. Rebinding here lets the XR store consume the current
                // session.inputSources even when that first change event raced
                // the renderer's sessionstart event.
                manager.dispatchEvent({ type: 'sessionstart' })
              }
            }
            // A host camera's makeDefault effect may run after XR's session
            // subscription. Keep frame subscribers on the tracked stereo camera.
            if (rootStore.getState().camera !== manager.getCamera()) {
              rootStore.setState({ camera: manager.getCamera() })
            }
            const frameState = rootStore.getState()
            advanceXRFrameWithoutDesktopRender(frameState, () => {
              // R3F's manual clock takes seconds, XR supplies milliseconds.
              advance(frameClock(time), true, frameState, frame)
            })
            renderImmersiveXRFrame(renderer, frameState.scene, baseCamera)
          } catch (error) {
            fail(error)
          }
        },
        {
          dpr: state.viewport.dpr,
          height: state.size.height,
          width: state.size.width,
        },
      )
      restoreFrameLoop = restore
      if (cancelled) {
        // React Strict Mode can begin the replacement binding before this
        // async setup settles. Only restore when this cancelled setup still
        // owns the renderer; otherwise it would erase the newer frame loop.
        if (ownsXRFrameLoopBinding(activeBinding.current, binding)) restore()
        return
      }

      if (manager.getSession() !== session) await manager.setSession(session)
      if (cancelled) {
        if (ownsXRFrameLoopBinding(activeBinding.current, binding)) restore()
        return
      }
      if (renderer.domElement.parentElement?.dataset.webxr_runtime) {
        // The editor's renderer was sized for its split viewer before IWER
        // moved it into the fullscreen emulator host. Resize the drawing
        // surface as well as its CSS box so neither eye retains that old pane.
        const resize = () => {
          renderer.setSize(window.innerWidth, window.innerHeight, false)
        }
        resize()
        window.addEventListener('resize', resize)
        removeEmulatorResize = () => window.removeEventListener('resize', resize)
      }
      session.addEventListener(
        'end',
        () => stopXRFrameLoop(renderer as unknown as XRFrameLoopRenderer),
        { once: true },
      )
      const baseLayer = manager.getBaseLayer() as XRWebGLLayer | undefined
      const backend = (
        renderer as unknown as {
          backend?: { state?: Parameters<typeof supportEmulatedDefaultFramebuffer>[0] }
        }
      ).backend
      if (baseLayer?.framebuffer === null && backend?.state) {
        restoreDrawBuffers = supportEmulatedDefaultFramebuffer(backend.state)
      }
      // updateCamera copies clipping from the application camera every frame.
      // Setting only the XR camera is overwritten on the first render. A 1mm
      // near plane loses the depth precision needed to separate ground surfaces.
      applyWebXRCameraClipping(baseCamera as Parameters<typeof applyWebXRCameraClipping>[0])
      applyWebXRCameraClipping(manager.getCamera())
      session.updateRenderState({
        baseLayer: manager.getBaseLayer() as XRWebGLLayer | undefined,
        depthFar: WEBXR_CAMERA_FAR,
        depthNear: WEBXR_CAMERA_NEAR,
      })

      // The WebGPU renderer's WebGL backend can omit Three's sessionstart event,
      // which leaves @react-three/xr unaware of controllers and hands.
      if (store.getState().session !== session) {
        manager.dispatchEvent({ type: 'sessionstart' })
      }
      resyncInputsOnNextFrame = true
      attached = true
    }

    void attachSession().catch(fail)

    return () => {
      cancelled = true
      restoreDrawBuffers?.()
      removeEmulatorResize?.()
      if (ownsXRFrameLoopBinding(activeBinding.current, binding)) restoreFrameLoop?.()
    }
  }, [onError, qualityPreset, renderer, r3fXR, rootStore, session, store])

  return null
}

export type WebXRSessionRootProps = {
  children: ReactNode
  onError?: (cause: unknown) => void
  originPosition?: [number, number, number]
  originRotation?: [number, number, number]
  session?: XRSession
  store: XRStore
  qualityPreset?: XRQualityPreset
}

export function WebXRSessionRoot({
  children,
  onError,
  originPosition,
  originRotation,
  session,
  store,
  qualityPreset,
}: WebXRSessionRootProps) {
  return (
    <XR store={store}>
      <XROrigin position={originPosition} rotation={originRotation} />
      <XRSessionBinding onError={onError} qualityPreset={qualityPreset} session={session} store={store} />
      {children}
    </XR>
  )
}
