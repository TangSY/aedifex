'use client'

import { useFrame } from '@react-three/fiber'
import {
  CombinedPointer,
  useXRInputSourceState,
  useXRInputSourceStateContext,
  XRSpace,
} from '@react-three/xr'
import {
  type ComponentType,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react'
import { type Group, type Object3D, Vector3 } from 'three'
import { DistanceAwareRayPointer } from '../../distance-aware-ray-pointer'
import { isQuestXPressed } from '../../controller-buttons'
import { GodModeHandControls } from '../../god-mode/input/god-mode-hand-controls'
import { GodModeControls } from '../../god-mode/ui/god-mode-controls'
import { HumanModeHandControls } from '../../human-mode/input/hand-locomotion'
import { pulseInputSource } from '../../human-mode/lib/haptics'
import { HumanModeControls } from '../../human-mode/ui/human-mode-controls'
import { VisibleXRController, VisibleXRHand } from '../../input-visuals'
import { DISTANCE_AWARE_RAY_POINTER_OPTIONS } from '../../pointer-cursor'
import { isR3FPointerTarget } from '../../pointer-filter'
import type { WebXRStore } from '../../../runtime'
import {
  DEFAULT_WEBXR_SCENE_LAYERS,
  type WebXRSceneLayers,
  WebXRSceneLayersProvider,
} from '../../layers'
import type { StandingSceneProvider } from '../lib/standing-destination'
import { PlayerModeRig } from './player-mode-rig'
import {
  advanceThumbModeGesture,
  areThumbTipsTouching,
  type ThumbModeGestureState,
} from '../lib/thumb-mode-gesture'
import { useWebXRSessionControls } from '../../../session-controls'
import { useXRPlayerMode, XR_PLAYER_MODES } from '../store/player-mode'

function PlayerModeDefaultHand() {
  return (
    <>
      <VisibleXRHand grabPointer={false} rayPointer={false} touchPointer={false} />
      <CombinedPointer>
        <DistanceAwareRayPointer
          options={{
            ...DISTANCE_AWARE_RAY_POINTER_OPTIONS,
            filter: isR3FPointerTarget,
            rayModel: {
              ...DISTANCE_AWARE_RAY_POINTER_OPTIONS.rayModel,
              maxLength: 0.2,
            },
          }}
        />
      </CombinedPointer>
    </>
  )
}

function PlayerModeHandInput() {
  return (
    <>
      <PlayerModeDefaultHand />
      <GodModeHandControls />
      <HumanModeHandControls />
      <PlayerModeHandThumbInput />
    </>
  )
}

type InputSourceOverlay = ComponentType<{ type: 'controller' | 'hand' }>

function createPlayerModeHandInput(InputSourceOverlay: InputSourceOverlay) {
  return function PlayerModeHandInputWithOverlay() {
    return (
      <>
        <PlayerModeDefaultHand />
        <GodModeHandControls />
        <HumanModeHandControls />
        <PlayerModeHandThumbInput />
        <InputSourceOverlay type="hand" />
      </>
    )
  }
}

function PlayerModeDefaultController() {
  return (
    <>
      <VisibleXRController grabPointer={false} rayPointer={false} />
      <CombinedPointer>
        <DistanceAwareRayPointer
          options={{
            ...DISTANCE_AWARE_RAY_POINTER_OPTIONS,
            filter: isR3FPointerTarget,
          }}
        />
      </CombinedPointer>
    </>
  )
}

function createPlayerModeControllerInput(InputSourceOverlay?: InputSourceOverlay) {
  return function PlayerModeControllerInputWithOverlay() {
    return (
      <>
        <PlayerModeDefaultController />
        {InputSourceOverlay && <InputSourceOverlay type="controller" />}
      </>
    )
  }
}

type Handedness = 'left' | 'right'

const thumbObjects: Record<Handedness, Object3D | null> = { left: null, right: null }

function PlayerModeHandThumbInput() {
  const state = useXRInputSourceStateContext('hand')
  const handedness = state.inputSource.handedness
  const setThumbObject = useCallback(
    (object: Object3D | null) => {
      if (handedness === 'left' || handedness === 'right') thumbObjects[handedness] = object
    },
    [handedness],
  )

  return <XRSpace ref={setThumbObject} space="thumb-tip" />
}

function PlayerModeHandToggle({ disabled = false }: { disabled?: boolean }) {
  const leftHand = useXRInputSourceState('hand', 'left')
  const rightHand = useXRInputSourceState('hand', 'right')
  const leftThumb = useRef({ position: new Vector3(), visible: false })
  const rightThumb = useRef({ position: new Vector3(), visible: false })
  const gesture = useRef<ThumbModeGestureState>({ elapsed: 0, triggered: false })
  const selectionBlockedGesture = useRef(false)

  useFrame((_, delta) => {
    if (disabled) return
    const leftObject = thumbObjects.left
    const rightObject = thumbObjects.right
    leftThumb.current.visible = leftObject?.visible === true
    rightThumb.current.visible = rightObject?.visible === true
    if (leftThumb.current.visible) leftObject!.getWorldPosition(leftThumb.current.position)
    if (rightThumb.current.visible) rightObject!.getWorldPosition(rightThumb.current.position)

    const selecting =
      leftHand?.inputSource.gamepad?.buttons[0]?.pressed === true ||
      rightHand?.inputSource.gamepad?.buttons[0]?.pressed === true
    const touching = areThumbTipsTouching(leftThumb.current, rightThumb.current)
    if (selecting) selectionBlockedGesture.current = true
    else if (!touching) selectionBlockedGesture.current = false
    if (
      advanceThumbModeGesture(gesture.current, touching && !selectionBlockedGesture.current, delta)
    ) {
      useXRPlayerMode.getState().toggle()
    }
  })

  return null
}

function PlayerModeControllerToggle() {
  const leftController = useXRInputSourceState('controller', 'left')
  const pressed = useRef(false)

  useFrame(() => {
    const nextPressed = isQuestXPressed(leftController)
    if (!pressed.current && nextPressed) {
      useXRPlayerMode.getState().toggle()
      pulseInputSource(leftController?.inputSource, 0.25, 35)
    }
    pressed.current = nextPressed
  })
  return null
}

export function PlayerModeScene({
  children,
  inputSourceOverlay,
  layers = DEFAULT_WEBXR_SCENE_LAYERS,
  store,
  uiContent,
  standingScene,
}: {
  children: ReactNode
  inputSourceOverlay?: InputSourceOverlay
  layers?: WebXRSceneLayers
  store: WebXRStore
  uiContent?: ReactNode
  standingScene?: StandingSceneProvider
}) {
  const sceneRootRef = useRef<Group | null>(null)
  const entryRequested = useXRPlayerMode((state) => state.entryRequested)
  const HandInput = useMemo(
    () =>
      inputSourceOverlay ? createPlayerModeHandInput(inputSourceOverlay) : PlayerModeHandInput,
    [inputSourceOverlay],
  )
  const ControllerInput = useMemo(
    () => createPlayerModeControllerInput(inputSourceOverlay),
    [inputSourceOverlay],
  )

  useEffect(() => {
    useXRPlayerMode.getState().reset()
    if (useWebXRSessionControls.getState().startingMode === 'human') {
      useXRPlayerMode.getState().setMode('human')
    }
    store.setHand(HandInput)
    store.setController(ControllerInput)
    return () => {
      store.setHand(VisibleXRHand)
      store.setController(VisibleXRController)
      useXRPlayerMode.getState().reset()
    }
  }, [ControllerInput, HandInput, store])

  return (
    <WebXRSceneLayersProvider layers={layers}>
      <PlayerModeControllerToggle />
      <PlayerModeHandToggle disabled={inputSourceOverlay != null || uiContent != null} />
      <GodModeControls sceneRootRef={sceneRootRef} />
      <HumanModeControls sceneRootRef={sceneRootRef} />
      <PlayerModeRig sceneRootRef={sceneRootRef} standingScene={standingScene} />
      {uiContent}
      <group name="xr-player-scene-root" ref={sceneRootRef} pointerEvents={entryRequested ? 'none' : 'auto'}>
        {children}
      </group>
    </WebXRSceneLayersProvider>
  )
}
