'use client'

import { useEditor } from '@aedifex/editor'
import { BATCHED_LAYER, OVERLAY_LAYER, useViewer, ZONE_LAYER } from '@aedifex/viewer'
import { RectangleGoggles, Orbit, PersonStanding, RotateCcw } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { createWebXRViewerSession, useWebXRSession } from '../../session'
import { requestGodScaleReset } from '../../xr/god-mode'
import { toggleXRPlayerMode, useXRPlayerMode, XR_PLAYER_MODES } from '../../xr/mode-switching'
import { XRFloatingWorkspace } from '../../xr/wand'
import { XREditorInputBridge } from './input/editor-input-bridge'
import { XREmulatorTestHarnessBridge } from './testing/emulator-test-harness'
import type { AedifexXRWandBindings } from './wand/bindings'
import type { XRQualityPreset } from '../../xr/frame-loop'
import { createAedifexXRWandAdapter } from './wand/create-adapter'
import { collectAedifexStandingScene } from './standing-scene'

export function useAedifexWebXR(
  bindings: AedifexXRWandBindings,
  qualityPreset: XRQualityPreset = 'balanced',
) {
  const feature = useWebXRSession(qualityPreset)
  const { session, runtime, fail } = feature

  useEffect(() => {
    if (!session) return
    const editor = useEditor.getState()
    const viewer = useViewer.getState()
    const previous = {
      viewMode: editor.viewMode,
      cameraMode: viewer.cameraMode,
      wallMode: viewer.wallMode,
      levelMode: viewer.levelMode,
    }
    editor.setFirstPersonMode(false)
    editor.setPreviewMode(false)
    editor.setCaptureMode(false)
    editor.setViewMode('3d')
    editor.setMode('select')
    editor.setTool(null)
    viewer.setCameraMode('perspective')
    viewer.setWallMode('up')
    viewer.setLevelMode('stacked')
    return () => {
      const currentEditor = useEditor.getState()
      const currentViewer = useViewer.getState()
      currentEditor.setMode('select')
      currentEditor.setTool(null)
      currentEditor.setViewMode(previous.viewMode)
      currentViewer.setCameraMode(previous.cameraMode)
      currentViewer.setWallMode(previous.wallMode)
      currentViewer.setLevelMode(previous.levelMode)
    }
  }, [session])

  const immersive = useMemo(() => {
    if (!session || runtime.status !== 'ready') return undefined
    const adapter = createAedifexXRWandAdapter(bindings)
    return createWebXRViewerSession(
      runtime.store,
      session,
      undefined,
      <>
        <XREditorInputBridge />
        {process.env.NODE_ENV !== 'production' && <XREmulatorTestHarnessBridge />}
      </>,
      { batched: BATCHED_LAYER, overlay: OVERLAY_LAYER, zone: ZONE_LAYER },
      fail,
      <XRFloatingWorkspace adapter={adapter} />,
      qualityPreset,
      collectAedifexStandingScene,
    )
  }, [bindings, fail, qualityPreset, runtime, session])

  return { ...feature, immersive }
}

export function AedifexWebXRButton({
  feature,
  className,
}: {
  feature: ReturnType<typeof useAedifexWebXR>
  className?: string
}) {
  const mode = useXRPlayerMode((state) => state.mode)
  const entryRequested = useXRPlayerMode((state) => state.entryRequested)
  const entryPlaced = useXRPlayerMode((state) => state.entryPlaced)
  const inputLocked = useXRPlayerMode((state) => state.inputLocked)
  const transitionPhase = useXRPlayerMode((state) => state.transitionPhase)
  const entryMessage = useXRPlayerMode((state) => state.entryMessage)
  const active = !!feature.session
  const label = active ? 'Exit VR' : feature.entering ? 'Entering VR' : 'Enter VR'
  return (
    <>
      <button
        aria-label={label}
        aria-pressed={active}
        className={className}
        disabled={!feature.ready || feature.entering}
        onClick={() => void (active ? feature.exit() : feature.enter())}
        title={feature.error ?? (feature.ready ? label : 'Preparing VR')}
        type="button"
      >
        <RectangleGoggles className="h-4 w-4" />
      </button>
      {active && (
        <>
          <button
            aria-label={entryRequested ? (entryPlaced ? 'Enter placed target' : 'Place target in VR first') : `Switch to ${mode === XR_PLAYER_MODES.GOD ? 'Human' : 'God'} mode`}
            disabled={inputLocked || (entryRequested && !entryPlaced)}
            className={className}
            onClick={toggleXRPlayerMode}
            type="button"
          >
            {mode === XR_PLAYER_MODES.GOD ? (
              <PersonStanding className="h-4 w-4" />
            ) : (
              <Orbit className="h-4 w-4" />
            )}
          </button>
          {entryRequested && <>
            <span role="status">{entryMessage ?? 'Choose a safe floor in VR'}</span>
            <button disabled={inputLocked} className={className} onClick={() => useXRPlayerMode.getState().retargetEntry()} type="button">{entryPlaced ? 'Replace target' : 'Retarget entry'}</button>
            <button disabled={inputLocked} className={className} onClick={() => useXRPlayerMode.getState().cancelEntry()} type="button">Cancel entry</button>
          </>}
          {inputLocked && <span role="status" data-xr-transition-phase={transitionPhase}>{transitionPhase === 'rearm' ? 'Release grips, pinches and buttons; center sticks to continue.' : `Switching mode (${transitionPhase})…`}</span>}
          {mode === XR_PLAYER_MODES.GOD && (
            <button
              aria-label="Reset God view"
              disabled={inputLocked}
              className={className}
              onClick={requestGodScaleReset}
              type="button"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
        </>
      )}
      {feature.error && (
        <span
          role="alert"
          className="absolute top-full right-0 mt-2 max-w-sm rounded-md bg-background p-3 text-sm text-destructive shadow-lg"
        >
          {feature.error}
        </span>
      )}
    </>
  )
}
