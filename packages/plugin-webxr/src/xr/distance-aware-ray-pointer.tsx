'use client'

import { createPortal, useFrame, useThree } from '@react-three/fiber'
import {
  type DefaultXRInputSourceRayPointerOptions,
  usePointerXRInputSourceEvents,
  useRayPointer,
  useXRInputSourceStateContext,
  XRSpace,
} from '@react-three/xr'
import { useEffect, useMemo, useRef } from 'react'
import { type Layers, type Mesh, type Object3D, Quaternion, RingGeometry, Vector3 } from 'three'
import { useWebXRSceneLayers } from './layers'
import {
  POINTER_CURSOR_INNER_RADIUS,
  POINTER_CURSOR_OUTER_RADIUS,
  resolvePointerCursorSize,
  resolvePointerRayLength,
} from './pointer-cursor'
import { XR_PANEL_RENDER_ORDER } from './wand/theme'
import { PointerRingMaterial } from './pointer-ring-material'
import { isSpatialUIObject, spatialUIInputOwnership } from './spatial-ui'
import { useXRPlayerMode } from './mode-switching/store/player-mode'

const NEAR_RAY_HIDE_DISTANCE = 0.2
// Aedifex's ordinary scene geometry (including the wall collision meshes) uses
// Three's scene layer. The XR pointer has its own private Raycaster; do not
// rely on that raycaster retaining Three's default mask when the host changes
// its shared pointer layers for desktop rendering.
const SCENE_LAYER = 0
const Z_AXIS = new Vector3(0, 0, 1)
const ignoreRaycast = () => null

type RayIntersectorWithLayers = {
  raycaster?: { layers: Layers }
}

export function DistanceAwareRayPointer({
  options,
}: {
  options: DefaultXRInputSourceRayPointerOptions
}) {
  const state = useXRInputSourceStateContext()
  const layers = useWebXRSceneLayers()
  const space = useRef(null)
  const rayModel = useRef<Mesh>(null)
  const cursorModel = useRef<Mesh>(null)
  const scene = useThree((current) => current.scene)
  const renderer = useThree((current) => current.gl)
  const cursorMaterial = useMemo(() => new PointerRingMaterial(), [])
  const cursorGeometry = useMemo(
    () => new RingGeometry(POINTER_CURSOR_INNER_RADIUS, POINTER_CURSOR_OUTER_RADIUS, 32),
    [],
  )
  const normalQuaternion = useRef(new Quaternion())
  const objectQuaternion = useRef(new Quaternion())
  const cursorOffset = useRef(new Vector3())
  const pointer = useRayPointer(space, state, { ...options, makeDefault: true })
  const rayModelOptions = typeof options.rayModel === 'object' ? options.rayModel : undefined
  const cursorModelOptions =
    typeof options.cursorModel === 'object' ? options.cursorModel : undefined

  usePointerXRInputSourceEvents(pointer, state.inputSource, 'select', state.events)
  useEffect(() => useXRPlayerMode.subscribe((next, previous) => {
    if (next.inputLocked && !previous.inputLocked) {
      pointer.cancel(new PointerEvent('pointercancel'))
      pointer.setCapture(undefined)
      spatialUIInputOwnership.remove(state.inputSource)
    }
  }), [pointer, state.inputSource])
  useEffect(() => {
    const session = renderer.xr.getSession()
    const source = state.inputSource
    const start = (event: XRInputSourceEvent) => {
      if (event.inputSource === source) {
        spatialUIInputOwnership.press(source, isSpatialUIObject(pointer.getIntersection()?.object))
      }
    }
    const end = (event: XRInputSourceEvent) => {
      if (event.inputSource === source) spatialUIInputOwnership.release(source)
    }
    session?.addEventListener('selectstart', start)
    session?.addEventListener('selectend', end)
    return () => {
      session?.removeEventListener('selectstart', start)
      session?.removeEventListener('selectend', end)
      spatialUIInputOwnership.remove(source)
    }
  }, [pointer, renderer, state.inputSource])
  useEffect(() => () => cursorMaterial.dispose(), [cursorMaterial])
  useEffect(() => () => cursorGeometry.dispose(), [cursorGeometry])
  useEffect(() => {
    const raycastLayers = (pointer.intersector as unknown as RayIntersectorWithLayers).raycaster
      ?.layers
    if (!raycastLayers) return
    const mask = raycastLayers.mask
    raycastLayers.enable(SCENE_LAYER)
    raycastLayers.enable(layers.batched)
    raycastLayers.enable(layers.overlay)
    raycastLayers.enable(layers.zone)
    return () => {
      raycastLayers.mask = mask
    }
  }, [layers, pointer])

  useFrame((_, __, frame) => {
    const intersection = pointer.getIntersection()
    const referenceSpace = renderer.xr.getReferenceSpace()
    const tracked =
      !frame || !referenceSpace || !!frame.getPose(state.inputSource.targetRaySpace, referenceSpace)
    if (tracked) {
      spatialUIInputOwnership.hover(
        state.inputSource,
        pointer.getEnabled() && isSpatialUIObject(intersection?.object),
      )
    } else {
      spatialUIInputOwnership.remove(state.inputSource)
    }
    if (!tracked || !pointer.getEnabled()) {
      if (rayModel.current) rayModel.current.visible = false
      if (cursorModel.current) cursorModel.current.visible = false
      return
    }

    const distance = intersection?.distance
    const hasSurfaceHit = intersection != null && distance != null && Number.isFinite(distance) &&
      (intersection.object as Object3D & { isVoidObject?: boolean }).isVoidObject !== true

    if (rayModel.current) {
      // Controllers keep their aiming guide during placement, including near previews.
      // Hands retain the near-surface suppression used for direct interaction.
      rayModel.current.visible = !state.inputSource.hand || !hasSurfaceHit || distance! >= NEAR_RAY_HIDE_DISTANCE
      const rayLength = resolvePointerRayLength(hasSurfaceHit ? distance : undefined, rayModelOptions?.maxLength)
      rayModel.current.position.z = -rayLength / 2
      const raySize = rayModelOptions?.size ?? 0.005
      rayModel.current.scale.set(raySize, raySize, rayLength)
    }

    if (!hasSurfaceHit || !intersection || distance == null) {
      if (cursorModel.current) cursorModel.current.visible = false
      return
    }

    if (!cursorModel.current) return
    cursorModel.current.visible = true
    cursorModel.current.position.copy(intersection.pointOnFace)
    const normal = intersection.normal ?? intersection.face?.normal
    if (normal) {
      normalQuaternion.current.setFromUnitVectors(Z_AXIS, normal)
      intersection.object.getWorldQuaternion(objectQuaternion.current)
      cursorModel.current.quaternion
        .copy(objectQuaternion.current)
        .multiply(normalQuaternion.current)
      cursorOffset.current
        .set(0, 0, cursorModelOptions?.cursorOffset ?? 0.008)
        .applyQuaternion(cursorModel.current.quaternion)
      cursorModel.current.position.add(cursorOffset.current)
    }
    cursorModel.current.scale.setScalar(resolvePointerCursorSize(distance))
    cursorModel.current.updateMatrix()

    if (cursorModelOptions) {
      const color =
        typeof cursorModelOptions.color === 'function'
          ? cursorModelOptions.color(pointer)
          : cursorModelOptions.color
      if (Array.isArray(color)) cursorMaterial.color.set(...color)
      else cursorMaterial.color.set(color ?? 'white')
      cursorMaterial.opacity =
        typeof cursorModelOptions.opacity === 'function'
          ? cursorModelOptions.opacity(pointer)
          : (cursorModelOptions.opacity ?? 0.4)
    }
  })

  const rayColor =
    typeof rayModelOptions?.color === 'function'
      ? rayModelOptions.color(pointer)
      : (rayModelOptions?.color ?? 'white')

  return (
    <XRSpace ref={space} space="target-ray-space">
      {options.rayModel !== false && (
        <mesh
          layers={layers.overlay}
          position-z={-0.5}
          raycast={ignoreRaycast}
          ref={rayModel}
          renderOrder={XR_PANEL_RENDER_ORDER + 1001}
        >
          <boxGeometry />
          <meshBasicMaterial
            color={rayColor}
            depthWrite={false}
            opacity={0.4}
            toneMapped={false}
            transparent
          />
        </mesh>
      )}
      {createPortal(
        <mesh
          frustumCulled={false}
          layers={layers.overlay}
          name="xr-distance-ring-cursor"
          raycast={ignoreRaycast}
          ref={cursorModel}
          renderOrder={XR_PANEL_RENDER_ORDER + 1002}
        >
          <primitive attach="geometry" object={cursorGeometry} />
          <primitive attach="material" object={cursorMaterial} />
        </mesh>,
        scene,
      )}
    </XRSpace>
  )
}
