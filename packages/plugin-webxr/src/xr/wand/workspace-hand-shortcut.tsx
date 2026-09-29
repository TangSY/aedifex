'use client'

import { createPortal, useFrame } from '@react-three/fiber'
import { useXR, useXRInputSourceState } from '@react-three/xr'
import { useMemo, useRef, useState } from 'react'
import { DoubleSide, type Group, Vector3 } from 'three'
import { useWebXRSceneLayers } from '../layers'
import { useXRPlayerMode } from '../mode-switching/store/player-mode'
import { SpatialButton } from './spatial-controls'
import { SpatialText } from './spatial-text'
import { SpatialLine } from './spatial-line'
import { XR_WAND_THEME } from './theme'
import {
  WRIST_BAND,
  WRIST_BAND_EDGES,
  WRIST_BAND_TILES,
} from './wrist-band-layout'
import { useXRWorkspace } from './workspace-store'
import {
  createWristWatchPose,
  createControllerWatchPose,
  watchFaceVisible,
  watchPointerAllowed,
  wristModeAction,
} from './wrist-watch'

const ignoreRaycast = () => undefined

/** Inner-wrist watch, independent of the floating workspace's visibility. */
export function WorkspaceHandShortcut() {
  const origin = useXR((state) => state.origin)
  const session = useXR((state) => state.session)
  const referenceSpace = useXR((state) => state.originReferenceSpace)
  const { overlay } = useWebXRSceneLayers()
  const hand = useXRInputSourceState('hand', 'left')
  const controller = useXRInputSourceState('controller', 'left')
  const visible = useXRWorkspace((state) => state.visible)
  const mode = useXRPlayerMode((state) => state.mode)
  const entryRequested = useXRPlayerMode((state) => state.entryRequested)
  const entryPlaced = useXRPlayerMode((state) => state.entryPlaced)
  const action = wristModeAction(mode)
  const watch = useRef<Group>(null)
  const screen = useRef<Group>(null)
  const shown = useRef(false)
  const [faceVisible, setFaceVisible] = useState(false)
  const pose = useMemo(createWristWatchPose, [])
  const controllerPose = useMemo(createControllerWatchPose, [])
  const points = useMemo(
    () => Array.from({ length: 4 }, () => new Vector3()),
    [],
  )
  const wrist = hand?.inputSource.hand?.get('wrist')
  const index = hand?.inputSource.hand?.get('index-finger-metacarpal')
  const pinky = hand?.inputSource.hand?.get('pinky-finger-metacarpal')
  const gripSpace = controller?.inputSource.gripSpace

  useFrame((_, __, frame) => {
    if (!watch.current || !origin) return
    let view = null
    const viewerPose =
      session?.visibilityState === 'visible' && frame && referenceSpace
        ? frame.getViewerPose(referenceSpace)
        : null
    const joints =
      viewerPose && wrist && index && pinky
        ? [wrist, index, pinky].map((joint) =>
            frame!.getJointPose?.(joint, referenceSpace!),
          )
        : []
    // Head and joints share one reference frame, unaffected by renderer camera reparenting.
    if (viewerPose && joints.length === 3 && joints.every(Boolean)) {
      joints.forEach((joint, i) => points[i]!.copy(joint!.transform.position))
      points[3]!.copy(viewerPose.transform.position)
      view = pose.update(points[0]!, points[1]!, points[2]!, points[3]!)
      if (view) {
        watch.current.position.copy(pose.position)
        watch.current.quaternion.copy(pose.rotation)
      }
    }
    // Prefer actual wrist joints; fall back to a tracked controller grip during handoff.
    if (!view && viewerPose && gripSpace && frame && referenceSpace) {
      const grip = frame.getPose(gripSpace, referenceSpace)
      if (grip) {
        points[3]!.copy(viewerPose.transform.position)
        view = controllerPose.update(grip.transform, points[3]!)
        if (view) {
          watch.current.position.copy(controllerPose.position)
          watch.current.quaternion.copy(controllerPose.rotation)
        }
      }
    }
    watch.current.visible = view !== null
    const next = watchFaceVisible(shown.current, view)
    // Gate raycasts immediately, before React unmounts any captured button.
    if (screen.current) {
      screen.current.visible = next
      screen.current.pointerEvents = next ? 'auto' : 'none'
    }
    if (next !== shown.current) {
      shown.current = next
      setFaceVisible(next)
    }
  })

  if (!origin || (!(wrist && index && pinky) && !gripSpace)) return null

  return createPortal(
    <>
      <group ref={watch} visible={false} name="xr-wrist-watch">
        {/* A flat cuff around the forearm, with a continuous outline on each edge. */}
        <mesh
          layers={overlay}
          scale={[WRIST_BAND.radiusX, 1, WRIST_BAND.radiusZ]}
          raycast={ignoreRaycast}
          pointerEvents="none"
        >
          <cylinderGeometry args={[1, 1, WRIST_BAND.width, 64, 1, true]} />
          <meshBasicMaterial
            color={XR_WAND_THEME.panel}
            side={DoubleSide}
            toneMapped={false}
          />
        </mesh>
        {WRIST_BAND_EDGES.map((edge, i) => (
          <SpatialLine
            key={i}
            points={edge}
            color={XR_WAND_THEME.muted}
            opacity={0.65}
          />
        ))}
        <group
          ref={screen}
          name="xr-workspace-hand-shortcut"
          visible={faceVisible}
          pointerEvents={faceVisible ? 'auto' : 'none'}
          pointerEventsOrder={100}
          pointerEventsType={watchPointerAllowed}
        >
          {faceVisible &&
            [
              {
                name: 'xr-workspace-hand-toggle',
                label: visible ? 'Hide\npanel' : 'Show\npanel',
                run: () => useXRWorkspace.getState().toggle(),
              },
              {
                name: 'xr-wrist-mode-switch',
                label: mode === 'god' ? (entryRequested ? (entryPlaced ? 'Enter\nWalk' : 'Place\ntarget') : 'Enter\nWalk') : 'God\nmode',
                run: () => useXRPlayerMode.getState().setMode(action.target),
              },
              {
                name: 'xr-workspace-hand-rescue',
                label: 'Bring\nhere',
                run: () => useXRWorkspace.getState().recall(),
              },
            ].map((item, i) => (
              <group key={item.name} {...WRIST_BAND_TILES[i]!}>
                <SpatialButton
                  name={item.name}
                  position={[0, 0, 0]}
                  size={[WRIST_BAND.buttonWidth, WRIST_BAND.buttonHeight]}
                  cornerRadius={WRIST_BAND.cornerRadius}
                  selected={i === 1}
                  onClick={() => {
                    if (shown.current) item.run()
                  }}
                >
                  <SpatialText
                    color={XR_WAND_THEME.text}
                    fontSize={0.006}
                    maxWidth={0.022}
                    position={[0, 0, 0.008]}
                  >
                    {item.label}
                  </SpatialText>
                </SpatialButton>
              </group>
            ))}
        </group>
      </group>
    </>,
    origin,
  )
}
