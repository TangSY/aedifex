'use client'

import { createPortal, useFrame, useThree } from '@react-three/fiber'
import { useXR, useXRInputSourceState } from '@react-three/xr'
import { type RefObject, useEffect, useMemo, useRef } from 'react'
import {
  DoubleSide,
  BackSide,
  Group,
  type Mesh,
  type MeshBasicMaterial,
  Matrix4,
  Quaternion,
  Raycaster,
  Vector3,
} from 'three'
import { GOD_ORIGIN_POSITION, GOD_ORIGIN_ROTATION } from '../../god-mode'
import { useWebXRSceneLayers } from '../../layers'
import { PanelFace, SpatialButton } from '../../wand/spatial-controls'
import { SpatialText } from '../../wand/spatial-text'
import {
  captureGodSceneTransform,
  resetSceneForHumanScale,
  restoreGodSceneTransform,
  type SceneTransform,
} from '../lib/scene-scale-transition'
import {
  findStandingDestination,
  standingOriginPose,
  type StandingSceneProvider,
} from '../lib/standing-destination'
import { useXRPlayerMode } from '../store/player-mode'
import { createEntryTargeting } from '../lib/entry-targeting'
import { rayHitsSpatialUI } from '../../spatial-ui'
import { createModeTransition } from '../lib/mode-transition'
import { areXRInputsNeutral } from '../lib/neutral-input'

const emptyScene: StandingSceneProvider = () => ({
  floors: [],
  obstacles: [],
  fallbacks: [],
})
const ignoreRaycast = () => undefined

/** All entry actions request the same preview; only this rig commits a validated entry. */
export function PlayerModeRig({
  sceneRootRef,
  standingScene = emptyScene,
}: {
  sceneRootRef: RefObject<Group | null>
  standingScene?: StandingSceneProvider
}) {
  const origin = useXR((s) => s.origin)
  const referenceSpace = useXR((s) => s.originReferenceSpace)
  const session = useXR((s) => s.session)
  const scene = useThree((s) => s.scene)
  const controller = useXRInputSourceState('controller', 'right')
  const hand = useXRInputSourceState('hand', 'right')
  const requested = useXRPlayerMode((s) => s.entryRequested)
  const placed = useXRPlayerMode((s) => s.entryPlaced)
  const message = useXRPlayerMode((s) => s.entryMessage)
  const locked = useXRPlayerMode((s) => s.inputLocked)
  const phase = useXRPlayerMode((s) => s.transitionPhase)
  const { overlay } = useWebXRSceneLayers()
  const godTransform = useRef<SceneTransform | null>(null)
  const transition = useMemo(createModeTransition, [])
  const fade = useRef<Mesh>(null)
  const fadeMaterial = useRef<MeshBasicMaterial>(null)
  const releaseHint = useRef<Group>(null)
  const wasRequested = useRef(false)
  const handledRetarget = useRef(0)
  const hud = useRef<Group>(null)
  const marker = useRef<Group>(null)
  const targeting = useMemo(createEntryTargeting, [])
  const trackedHead = useRef<{
    position: Vector3
    orientation: Quaternion
  } | null>(null)
  const elapsed = useRef(0)
  const scratch = useMemo(
    () => ({
      head: new Vector3(),
      localHead: new Vector3(),
      direction: new Vector3(),
      localDirection: new Vector3(),
      rotation: new Quaternion(),
      inverse: new Matrix4(),
      pointerRotation: new Quaternion(),
      pointerPosition: new Vector3(),
      pointerDirection: new Vector3(),
      ray: new Raycaster(),
    }),
    [],
  )

  function clearSelection() {
    targeting.retarget()
    elapsed.current = 1
    useXRPlayerMode
      .getState()
      .rejectEntry(
        'Point at a clear floor, then click the trigger or pinch to place your target.',
      )
  }

  useEffect(() => {
    transition.reset()
    return () => {
      transition.reset()
    }
  }, [session, transition])

  useEffect(() => {
    if (!session || !referenceSpace || !origin) return
    const presses = new Map<XRInputSource, number>()
    const ray = new Raycaster()
    ray.layers.enableAll()
    function readRay(event: XRInputSourceEvent) {
      if (
        event.inputSource.handedness !== 'right' ||
        session!.visibilityState !== 'visible'
      )
        return false
      const pose = event.frame.getPose(
        event.inputSource.targetRaySpace,
        referenceSpace!,
      )
      if (!pose) return false
      origin!.updateWorldMatrix(true, true)
      ray.set(
        new Vector3()
          .copy(pose.transform.position)
          .applyMatrix4(origin!.matrixWorld),
        new Vector3(0, 0, -1)
          .applyQuaternion(new Quaternion().copy(pose.transform.orientation))
          .transformDirection(origin!.matrixWorld),
      )
      return !rayHitsSpatialUI(scene, ray)
    }
    const start = (event: XRInputSourceEvent) => {
      presses.delete(event.inputSource)
      const state = useXRPlayerMode.getState()
      if (
        state.entryRequested &&
        !state.inputLocked &&
        !state.entryPlaced &&
        state.entryTargetRevision === handledRetarget.current &&
        wasRequested.current &&
        readRay(event)
      )
        presses.set(event.inputSource, state.entryTargetRevision)
    }
    const select = (event: XRInputSourceEvent) => {
      const revision = presses.get(event.inputSource)
      presses.delete(event.inputSource)
      const state = useXRPlayerMode.getState()
      const root = sceneRootRef.current
      if (
        revision === undefined ||
        revision !== state.entryTargetRevision ||
        !state.entryRequested ||
        state.inputLocked ||
        state.entryPlaced ||
        !root ||
        !readRay(event)
      )
        return
      // getViewerPose is only legal on animation frames, not XR input-event frames.
      const viewer = trackedHead.current
      if (!viewer) return
      root.updateWorldMatrix(true, true)
      const inverse = root.matrixWorld.clone().invert()
      const direction = new Vector3(0, 0, -1)
        .applyQuaternion(viewer.orientation)
        .transformDirection(origin.matrixWorld)
        .transformDirection(inverse)
      const destination = findStandingDestination({
        ...standingScene(root),
        fallbacks: [],
        aimOrigin: ray.ray.origin.clone().applyMatrix4(inverse),
        aimDirection: ray.ray.direction.clone().transformDirection(inverse),
        standingHeight: Math.max(1.8, viewer.position.y),
      })
      if (
        targeting.place(
          destination,
          Math.atan2(-direction.x, -direction.z),
          false,
        )
      )
        state.placeEntry()
      else
        state.setEntryMessage(
          'Cannot place here — aim at a clear, supported floor.',
        )
    }
    const cancel = () => {
      presses.clear()
      trackedHead.current = null
    }
    session.addEventListener('selectstart', start)
    // Complete the press/release cycle. IWER emits `select` before `selectstart`,
    // unlike native headsets; selectend gives both a consistent placement edge.
    session.addEventListener('selectend', select)
    session.addEventListener('visibilitychange', cancel)
    session.addEventListener('inputsourceschange', cancel)
    session.addEventListener('selectcancel', cancel)
    return () => {
      session.removeEventListener('selectstart', start)
      session.removeEventListener('selectend', select)
      session.removeEventListener('visibilitychange', cancel)
      session.removeEventListener('inputsourceschange', cancel)
      session.removeEventListener('selectcancel', cancel)
    }
  }, [
    session,
    referenceSpace,
    origin,
    scene,
    sceneRootRef,
    standingScene,
    targeting,
  ])

  useFrame((_, delta, frame) => {
    const root = sceneRootRef.current
    if (!root || !origin) return
    const state = useXRPlayerMode.getState()
    if (!state.entryRequested && !state.inputLocked) {
      trackedHead.current = null
      wasRequested.current = false
      targeting.retarget()
      transition.reset()
      if (marker.current) marker.current.visible = false
      if (fade.current) fade.current.visible = false
      return
    }
    const viewer =
      session?.visibilityState === 'visible' &&
      referenceSpace &&
      frame?.getViewerPose(referenceSpace)
    if (!viewer) {
      trackedHead.current = null
      // Freeze the fade and never commit a pose without tracking/focus.
      if (state.inputLocked) {
        transition.advance(delta, false, false, () => {})
        return
      }
      useXRPlayerMode.getState().cancelEntry()
      return
    }
    scratch.head.copy(viewer.transform.position)
    scratch.rotation.copy(viewer.transform.orientation)
    trackedHead.current ??= {
      position: new Vector3(),
      orientation: new Quaternion(),
    }
    trackedHead.current.position.copy(scratch.head)
    trackedHead.current.orientation.copy(scratch.rotation)
    scratch.direction.set(0, 0, -1).applyQuaternion(scratch.rotation)
    function commitEntry() {
      const selection = targeting.selected
      if (!selection || !targeting.placed) {
        state.rejectEntry('Entry blocked — place a clear floor target first.')
        return
      }
      const point = selection.destination.point
      const fresh = findStandingDestination({
        ...standingScene(root!),
        fallbacks: [],
        aimOrigin: point.clone().add(new Vector3(0, 0.15, 0)),
        aimDirection: new Vector3(0, -1, 0),
        maximumDistance: 0.3,
        standingHeight: Math.max(1.8, scratch.head.y),
      })
      if (!fresh || fresh.point.distanceTo(point) > 0.03) {
        state.rejectEntry(
          'Destination changed or became blocked. Replace the target.',
        )
        return
      }
      const arrival = standingOriginPose(
        fresh.point,
        scratch.head,
        Math.atan2(-scratch.direction.x, -scratch.direction.z),
        selection.yaw,
      )
      godTransform.current = captureGodSceneTransform(root!)
      resetSceneForHumanScale(root!)
      origin!.position.copy(arrival.position)
      origin!.rotation.set(0, arrival.yaw, 0)
      origin!.updateWorldMatrix(true, true)
      state.completeEntry()
      wasRequested.current = false
    }
    if (state.inputLocked) {
      if (transition.phase === 'idle') transition.start()
      const phase = transition.advance(
        delta,
        true,
        areXRInputsNeutral(session!.inputSources, frame!, referenceSpace!),
        () => {
          if (state.transitionTarget === 'god') {
            restoreGodSceneTransform(root, godTransform.current)
            origin.position.copy(GOD_ORIGIN_POSITION)
            origin.rotation.copy(GOD_ORIGIN_ROTATION)
            origin.updateWorldMatrix(true, true)
            state.completeReturn()
          } else commitEntry()
        },
      )
      if (state.transitionPhase !== phase) state.setTransitionPhase(phase)
      if (fade.current) {
        origin.updateWorldMatrix(true, false)
        fade.current.position
          .copy(scratch.head)
          .applyMatrix4(origin.matrixWorld)
        fade.current.visible = transition.opacity > 0
      }
      if (fadeMaterial.current)
        fadeMaterial.current.opacity = transition.opacity
      if (releaseHint.current) {
        releaseHint.current.position
          .copy(scratch.direction)
          .multiplyScalar(0.7)
          .add(scratch.head)
        releaseHint.current.position.y -= 0.12
        releaseHint.current.quaternion.copy(scratch.rotation)
      }
      return
    }
    if (!state.entryRequested) {
      trackedHead.current = null
      wasRequested.current = false
      targeting.retarget()
      if (marker.current) marker.current.visible = false
      return
    }
    if (!wasRequested.current) {
      clearSelection()
      handledRetarget.current = state.entryTargetRevision
      wasRequested.current = true
    }
    if (state.entryTargetRevision !== handledRetarget.current) {
      clearSelection()
      handledRetarget.current = state.entryTargetRevision
    }
    // React may mount the portal a frame after the request reaches the store.
    if (hud.current && !hud.current.userData.entryPlaced) {
      hud.current.position
        .copy(scratch.direction)
        .multiplyScalar(0.8)
        .add(scratch.head)
      hud.current.position.y -= 0.12
      hud.current.quaternion.copy(scratch.rotation)
      hud.current.userData.entryPlaced = true
    }
    origin.updateWorldMatrix(true, true)
    root.updateWorldMatrix(true, true)
    scratch.inverse.copy(root.matrixWorld).invert()
    scratch.localHead
      .copy(scratch.head)
      .applyMatrix4(origin.matrixWorld)
      .applyMatrix4(scratch.inverse)
    scratch.localDirection
      .copy(scratch.direction)
      .transformDirection(origin.matrixWorld)
      .transformDirection(scratch.inverse)
    const arrivalYaw = Math.atan2(
      -scratch.localDirection.x,
      -scratch.localDirection.z,
    )
    // Use the same target-ray pose as the user's visible pointer, not headset gaze.
    const pointerPose =
      referenceSpace &&
      frame &&
      ((hand &&
        frame.getPose(hand.inputSource.targetRaySpace, referenceSpace)) ||
        (controller &&
          frame.getPose(controller.inputSource.targetRaySpace, referenceSpace)))
    scratch.pointerPosition.copy(
      pointerPose?.transform.position ?? scratch.head,
    )
    scratch.pointerRotation.copy(
      pointerPose?.transform.orientation ?? scratch.rotation,
    )
    scratch.pointerDirection
      .set(0, 0, -1)
      .applyQuaternion(scratch.pointerRotation)
    scratch.ray.layers.enableAll()
    scratch.ray.set(
      scratch.pointerPosition.applyMatrix4(origin.matrixWorld),
      scratch.pointerDirection.transformDirection(origin.matrixWorld),
    )
    const overUI = rayHitsSpatialUI(scene, scratch.ray)
    scratch.localHead.copy(scratch.ray.ray.origin).applyMatrix4(scratch.inverse)
    scratch.localDirection
      .copy(scratch.ray.ray.direction)
      .transformDirection(scratch.inverse)
    elapsed.current += delta
    // Track world aim at 5 Hz; UI hover and pending confirmation freeze the displayed destination.
    if (
      !targeting.placed &&
      !overUI &&
      !state.entryConfirmed &&
      elapsed.current >= 0.2
    ) {
      elapsed.current = 0
      const surfaces = standingScene(root)
      const destination = findStandingDestination({
        ...surfaces,
        fallbacks: [],
        aimOrigin: scratch.localHead,
        aimDirection: scratch.localDirection,
        standingHeight: Math.max(1.8, scratch.head.y),
      })
      targeting.update(destination, arrivalYaw, overUI, state.entryConfirmed)
      if (destination) {
        state.setEntryMessage(
          'Click the trigger or pinch to place this target.',
        )
      } else
        state.setEntryMessage(
          'Point your right ray at clear ground or a floor, then click or pinch.',
        )
    }
    if (marker.current) {
      marker.current.visible = targeting.selected !== null
      if (targeting.selected) {
        marker.current.position.copy(targeting.selected.destination.point)
        marker.current.position.y += 0.025
        marker.current.rotation.y = targeting.selected.yaw
      }
    }
  }, -10)

  return (
    <>
      <mesh
        ref={fade}
        name="xr-mode-transition-fade"
        visible={false}
        layers={overlay}
        renderOrder={1000000}
        frustumCulled={false}
        pointerEvents="none"
        raycast={ignoreRaycast}
      >
        <sphereGeometry args={[1, 24, 16]} />
        <meshBasicMaterial
          ref={fadeMaterial}
          color="black"
          side={BackSide}
          transparent
          opacity={0}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
          fog={false}
        />
      </mesh>
      {phase === 'rearm' &&
        origin &&
        createPortal(
          <group
            ref={releaseHint}
            pointerEvents="none"
            name="xr-transition-release-hint"
          >
            <PanelFace width={0.46} height={0.09} depthTest={false} />
            <SpatialText
              depthTest={false}
              color="#fafafa"
              fontSize={0.016}
              maxWidth={0.42}
              position={[0, 0, 0.012]}
            >
              Release buttons, grips and pinches; center your sticks to
              continue.
            </SpatialText>
          </group>,
          origin,
        )}
      {requested && origin && sceneRootRef.current && (
        <>
          {createPortal(
            <group
              ref={marker}
              visible={false}
              pointerEvents="none"
              name="xr-entry-destination"
            >
              <mesh
                layers={overlay}
                rotation={[-Math.PI / 2, 0, 0]}
                raycast={ignoreRaycast}
              >
                <ringGeometry args={[0.23, 0.26, 48]} />
                <meshBasicMaterial
                  color={placed ? '#8de0b4' : '#8dbce0'}
                  side={DoubleSide}
                  toneMapped={false}
                />
              </mesh>
              <mesh
                layers={overlay}
                position={[0, 0.005, -0.16]}
                rotation={[-Math.PI / 2, 0, 0]}
                raycast={ignoreRaycast}
              >
                <coneGeometry args={[0.06, 0.14, 3]} />
                <meshBasicMaterial
                  color={placed ? '#8de0b4' : '#8dbce0'}
                  toneMapped={false}
                />
              </mesh>
            </group>,
            sceneRootRef.current,
          )}
          {createPortal(
            <group
              ref={hud}
              name="xr-entry-preview"
              pointerEvents={locked ? 'none' : 'auto'}
              pointerEventsOrder={110}
            >
              <PanelFace width={0.5} height={0.19} />
              <SpatialText
                color="#fafafa"
                fontSize={0.017}
                maxWidth={0.46}
                position={[0, 0.035, 0.012]}
              >
                {message ??
                  'Point your right ray at a floor to choose your entry point'}
              </SpatialText>
              <SpatialButton
                name="xr-entry-confirm"
                position={[-0.155, -0.05, 0]}
                size={[0.14, 0.048]}
                cornerRadius={0.006}
                disabled={!placed || locked}
                onClick={() => useXRPlayerMode.getState().setMode('human')}
              >
                <SpatialText
                  color="#fafafa"
                  fontSize={0.017}
                  position={[0, 0, 0.012]}
                >
                  Enter
                </SpatialText>
              </SpatialButton>
              <SpatialButton
                name="xr-entry-retarget"
                position={[0, -0.05, 0]}
                size={[0.14, 0.048]}
                cornerRadius={0.006}
                onClick={() => useXRPlayerMode.getState().retargetEntry()}
              >
                <SpatialText
                  color="#fafafa"
                  fontSize={0.017}
                  position={[0, 0, 0.012]}
                >
                  {placed ? 'Replace' : 'Retarget'}
                </SpatialText>
              </SpatialButton>
              <SpatialButton
                name="xr-entry-cancel"
                position={[0.155, -0.05, 0]}
                size={[0.14, 0.048]}
                cornerRadius={0.006}
                onClick={() => useXRPlayerMode.getState().cancelEntry()}
              >
                <SpatialText
                  color="#fafafa"
                  fontSize={0.017}
                  position={[0, 0, 0.012]}
                >
                  Cancel
                </SpatialText>
              </SpatialButton>
            </group>,
            origin,
          )}
        </>
      )}
    </>
  )
}
