'use client'

import {
  type AnyNode,
  type AnyNodeId,
  emitter,
  type GridEvent,
  type NodeEvent,
  sceneRegistry,
  useScene,
  useLiveNodeOverrides,
} from '@aedifex/core'
import { getHistoryCommandState, useEditor, useInteractionScope } from '@aedifex/editor'
import { useViewer } from '@aedifex/viewer'
import { useThree } from '@react-three/fiber'
import { useXR } from '@react-three/xr'
import { useEffect } from 'react'
import { Box3, Object3D, Quaternion, Raycaster, Vector3 } from 'three'
import { getEmulatedXRDevice } from '../../../runtime'
import { useXRWorkspace } from '../../../xr/wand/workspace-store'
import { useXRPlayerMode } from '../../../xr/mode-switching/store/player-mode'
import { useXRWandPanelSettings } from '../../../xr/wand'
import { resolveEmulatedInputPose } from './emulator-ray'
import { mountEmulatorTestControls } from './emulator-test-controls'

type InputKind = 'controller' | 'hand'

const XR_INPUT_EVENT_TIMEOUT_MS = 150
const XR_FRAME_TIMEOUT_MS = 100

export type XREmulatorTestHarness = {
  readWristWatch: () => Record<string, unknown>
  readGrid: () => Record<string, unknown>
  setTestSceneTransform: (scale: number, position: [number, number, number], yaw: number) => Promise<boolean>
  clickNodeOnce: (nodeId: string) => Promise<Record<string, unknown>>
  snapTurn: () => Promise<boolean>
  moveViewer: (delta: [number, number, number], yaw?: number) => Promise<boolean>
  setPlayerMode: (mode: 'god' | 'human') => Promise<void>
  aimAt: (name: string, inputKind?: InputKind) => Promise<boolean>
  aimAtNode: (nodeId: string, inputKind?: InputKind, distance?: number) => Promise<boolean>
  click: (name: string, inputKind?: InputKind) => Promise<boolean>
  clickLevelPoint: (point: [number, number], inputKind?: InputKind) => Promise<boolean>
  clickFloorFromViewer: (point: [number, number], inputKind?: InputKind) => Promise<boolean>
  clickPanelOnce: (name: string, inputKind?: InputKind) => Promise<Record<string, unknown>>
  pressPanelReleaseOnNode: (name: string, nodeId: string, inputKind?: InputKind) => Promise<Record<string, unknown>>
  readDragTrace: () => unknown[]
  setSnappingMode: (context: 'wall' | 'item' | 'polygon', mode: 'off' | 'grid' | 'lines' | 'angles') => void
  clickNode: (nodeId: string, inputKind?: InputKind) => Promise<boolean>
  clickNodeSurface: (nodeId: string, inputKind?: InputKind) => Promise<boolean>
  drag: (names: string[], inputKind?: InputKind) => Promise<boolean>
  dragWorkspace: (delta: [number, number, number], inputKind?: InputKind) => Promise<boolean>
  dragNodeTo: (
    nodeId: string,
    worldPoint: [number, number, number],
    inputKind?: InputKind,
  ) => Promise<boolean>
  listSceneNodes: () => { id: string; parentId: string | null; type: string }[]
  listSpatialTargets: () => string[]
  panGodView: (delta: [number, number, number]) => Promise<boolean>
  placeToolOnGrid: (
    toolTarget: string,
    nodeType: string,
    points: [number, number][],
    inputKind?: InputKind,
  ) => Promise<{
    activated: boolean
    cancelled: boolean
    createdNodeIds: string[]
    deliveredPoints: number
  }>
  placeToolOnNode: (
    toolTarget: string,
    hostNodeId: string,
    nodeType: string,
    inputKind?: InputKind,
  ) => Promise<{
    activated: boolean
    attachedToHost: boolean
    cancelled: boolean
    createdNodeIds: string[]
    deliveredHostClick: boolean
  }>
  probe: (name: string, inputKind?: InputKind) => Promise<Record<string, unknown>>
  probeNode: (
    nodeId: string,
    inputKind?: InputKind,
    distance?: number,
  ) => Promise<Record<string, unknown>>
  readNode: (nodeId: string) => AnyNode | undefined
  sculptLevelPoints: (points: [number, number][], inputKind?: InputKind) => Promise<boolean>
  snapshot: () => {
    activePaintMaterial: string | null
    hoveredTarget?: string
    history: {
      canRedo: boolean
      canUndo: boolean
      mode: string
      status: string
    }
    godViewTransform: {
      position: number[]
      rotationY: number
      scale: number[]
    } | null
    lastGridEvent?: string
    lastNodeEvent?: string
    lastPointerEvent?: string
    levelId: string | null
    mode: string
    nodeCounts: Record<string, number>
    paintEraser: boolean
    paintHover: {
      nodeNoun: string
      scopes: string[]
      slotLabel: string
    } | null
    paintScope: string
    terrainBrush: {
      falloff: number
      radius: number
      shape: string
      strength: number
    }
    terrainSampling: boolean
    terrainVerb: string
    wandPanelScale: number
    workspaceRecallRequest: number
    playerMode: string
    workspace: {
      recallPosition: number[]
      recallQuaternion: number[]
      localPosition: number[]
      quaternion: number[]
      position: number[]
      scale: number[]
      contentVisible: boolean
      dragging: boolean
    } | null
    wallSnappingMode: string
    scope: string
    selectedIds: string[]
    siteHasTerrain: boolean
    tool: string | null
    toolDefaults: Record<string, unknown>
  }
  scrollViews: () => { name: string; offset: number }[]
  dragSpatial: (name: string, delta: [number, number, number], inputKind?: InputKind) => Promise<boolean>
  listHandles: () => { id: string; position: number[] }[]
  dragHandle: (
    id: string,
    delta: [number, number, number],
    inputKind?: InputKind,
  ) => Promise<boolean>
  version: 1
}

declare global {
  var __aedifexXRLastGridEvent: string | undefined
  var __aedifexXRLastNodeEvent: string | undefined
  var __aedifexXRTestHarness: XREmulatorTestHarness | undefined
}

export function XREmulatorTestHarnessBridge() {
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const origin = useXR((state) => state.origin)
  const session = useXR((state) => state.session)

  useEffect(() => {
    if (!(origin && session && process.env.NODE_ENV === 'development')) return

    const recordNodeClick = (event: NodeEvent) => {
      globalThis.__aedifexXRLastNodeEvent = `click:${event.node.id}`
    }
    const recordNodeDown = (event: NodeEvent) => {
      globalThis.__aedifexXRLastNodeEvent = `down:${event.node.id}`
    }
    const recordGridClick = (event: GridEvent) => {
      globalThis.__aedifexXRLastGridEvent = `click:${event.localPosition.join(',')}`
    }
    emitter.on('node:click', recordNodeClick)
    emitter.on('node:pointerdown', recordNodeDown)
    emitter.on('grid:click', recordGridClick)

    const waitForXRFrames = (count = 1) =>
      new Promise<void>((resolve) => {
        const timeout = window.setTimeout(resolve, XR_FRAME_TIMEOUT_MS)
        const next = (remaining: number) => {
          session.requestAnimationFrame(() => {
            if (remaining === 1) {
              window.clearTimeout(timeout)
              resolve()
            } else next(remaining - 1)
          })
        }
        next(count)
      })

    const prepareInput = async (inputKind: InputKind) => {
      const device = getEmulatedXRDevice()
      if (!device) return false
      const deviceId = `${inputKind}-right`
      const inputModeChanged = device.primaryInputMode !== inputKind
      if (inputModeChanged) {
        await device.remote.dispatch('set_input_mode', { mode: inputKind })
      }
      await device.remote.dispatch('set_connected', {
        connected: true,
        device: `${inputKind}-left`,
      })
      await device.remote.dispatch('set_connected', {
        connected: true,
        device: deviceId,
      })
      const leftPosition =
        inputKind === 'controller' ? { x: -0.25, y: 1.5, z: -0.4 } : { x: -0.15, y: 1.3, z: -0.4 }
      await device.remote.dispatch('set_transform', {
        device: `${inputKind}-left`,
        orientation: { w: 1, x: 0, y: 0, z: 0 },
        position: leftPosition,
      })
      await waitForXRFrames(inputModeChanged ? 2 : 1)
      return true
    }

    const setInputPose = async (target: Object3D, inputKind: InputKind, distance = 0.5) => {
      const device = getEmulatedXRDevice()
      if (!device) return false
      const pose = resolveEmulatedInputPose(target, origin, distance)
      const deviceId = `${inputKind}-right`
      await device.remote.dispatch('set_transform', {
        device: deviceId,
        orientation: {
          w: pose.quaternion[3],
          x: pose.quaternion[0],
          y: pose.quaternion[1],
          z: pose.quaternion[2],
        },
        position: {
          x: pose.position[0],
          y: pose.position[1],
          z: pose.position[2],
        },
      })
      await waitForXRFrames()
      return true
    }

    const findTarget = (name: string) => {
      const matches: Object3D[] = []
      scene.traverseVisible((object) => {
        if (object.name === name) matches.push(object)
      })
      return matches[0]
    }

    const waitForTarget = async (name: string) => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const target = findTarget(name)
        if (target) return target
        await waitForXRFrames()
      }
      return undefined
    }

    const aimAt = async (name: string, inputKind: InputKind = 'controller') => {
      globalThis.__aedifexXRHoveredTarget = undefined
      if (!(await prepareInput(inputKind))) return false
      const target = await waitForTarget(name)
      if (!(target && (await setInputPose(target, inputKind)))) return false
      if (inputKind === 'hand') return true
      for (let attempt = 0; attempt < 5; attempt += 1) {
        if (globalThis.__aedifexXRHoveredTarget === name) return true
        await waitForXRFrames()
      }
      return findTarget(name) === target
    }

    const aimAtNode = async (
      nodeId: string,
      inputKind: InputKind = 'controller',
      distance = 1.25,
    ) => {
      if (!(await prepareInput(inputKind))) return false
      const device = getEmulatedXRDevice()
      if (!device) return false
      await device.remote.dispatch('set_transform', {
        device: `${inputKind}-left`,
        orientation: { w: 1, x: 0, y: 0, z: 0 },
        position: { x: -3, y: 1.5, z: 0 },
      })
      await waitForXRFrames()
      const registered = sceneRegistry.nodes.get(nodeId)
      if (!registered) return false
      registered.updateWorldMatrix(true, true)
      const bounds = new Box3().setFromObject(registered)
      const target = new Object3D()
      let targetDistance = distance
      if (bounds.isEmpty()) {
        const node = useScene.getState().nodes[nodeId as AnyNodeId]
        const vertices = (
          node as { topology?: { vertices?: { position?: number[] }[] } } | undefined
        )?.topology?.vertices
        const positions = vertices
          ?.map((vertex) => vertex.position)
          .filter(
            (position): position is [number, number, number] =>
              position?.length === 3 && position.every(Number.isFinite),
          )
        if (positions && positions.length > 0) {
          const localBounds = new Box3().setFromPoints(
            positions.map((position) => new Vector3().fromArray(position)),
          )
          localBounds.getCenter(target.position)
          registered.localToWorld(target.position)
          const worldScale = registered.getWorldScale(new Vector3())
          targetDistance = Math.max(
            targetDistance,
            localBounds.getSize(new Vector3()).multiply(worldScale).length() / 2 + 0.25,
          )
        } else {
          registered.getWorldPosition(target.position)
        }
      } else {
        bounds.getCenter(target.position)
        targetDistance = Math.max(targetDistance, bounds.getSize(new Vector3()).length() / 2 + 0.25)
      }
      const normal = camera.getWorldPosition(new Vector3()).sub(target.position).normalize()
      target.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), normal)
      target.updateMatrixWorld(true)
      const positioned = await setInputPose(target, inputKind, targetDistance)
      if (positioned) await waitForXRFrames(2)
      return positioned
    }

    const setSelectValue = async (value: number, inputKind: InputKind) => {
      const device = getEmulatedXRDevice()
      if (!device) return false
      await device.remote.dispatch('set_select_value', {
        device: `${inputKind}-right`,
        value,
      })
      return true
    }

    const waitForInputEvent = (inputKind: InputKind, eventType: 'selectend' | 'selectstart') =>
      new Promise<boolean>((resolve) => {
        const timeout = window.setTimeout(() => {
          session.removeEventListener(eventType, listener)
          resolve(false)
        }, XR_INPUT_EVENT_TIMEOUT_MS)
        const listener = (event: XRInputSourceEvent) => {
          const matchesKind =
            inputKind === 'hand' ? event.inputSource.hand != null : !event.inputSource.hand
          if (event.inputSource.handedness !== 'right' || !matchesKind) return
          window.clearTimeout(timeout)
          session.removeEventListener(eventType, listener)
          resolve(true)
        }
        session.addEventListener(eventType, listener)
      })

    const setSelectValueAndWait = async (
      value: 0 | 1,
      inputKind: InputKind,
      eventType: 'selectend' | 'selectstart',
    ) => {
      const eventReceived = waitForInputEvent(inputKind, eventType)
      if (!(await setSelectValue(value, inputKind))) return false
      await waitForXRFrames(2)
      await eventReceived
      return eventReceived
    }

    const click = async (name: string, inputKind: InputKind = 'controller') => {
      if (!(await aimAt(name, inputKind))) return false
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (attempt > 0 && !(await aimAt(name, inputKind))) return false
        globalThis.__aedifexXRLastPointerEvent = undefined
        await setSelectValueAndWait(1, inputKind, 'selectstart')
        await setSelectValueAndWait(0, inputKind, 'selectend')
        if (globalThis.__aedifexXRLastPointerEvent === `click:${name}`) return true
      }
      return false
    }

    const panGodView = async (delta: [number, number, number]) => {
      if (!(await prepareInput('controller'))) return false
      const device = getEmulatedXRDevice()
      const root = findTarget('xr-player-scene-root')
      if (!(device && root)) return false
      const deviceId = 'controller-right'
      const transform = (await device.remote.dispatch('get_transform', {
        device: deviceId,
      })) as {
        orientation: { w: number; x: number; y: number; z: number }
        position: { x: number; y: number; z: number }
      }
      await device.remote.dispatch('set_gamepad_state', {
        buttons: [{ index: 1, value: 1 }],
        device: deviceId,
      })
      await waitForXRFrames(2)
      await device.remote.dispatch('set_transform', {
        device: deviceId,
        orientation: transform.orientation,
        position: {
          x: transform.position.x + delta[0],
          y: transform.position.y + delta[1],
          z: transform.position.z + delta[2],
        },
      })
      await waitForXRFrames(2)
      await device.remote.dispatch('set_gamepad_state', {
        buttons: [{ index: 1, value: 0 }],
        device: deviceId,
      })
      await waitForXRFrames()
      return root.position.lengthSq() > 0.000_001
    }

    const clickLevelPoint = async (
      point: [number, number],
      inputKind: InputKind = 'controller',
      fromViewer = false,
    ) => {
      if (!(await prepareInput(inputKind))) return false
      const levelId = useViewer.getState().selection.levelId
      const levelNode = levelId ? useScene.getState().nodes[levelId] : undefined
      const levelObject = levelId ? sceneRegistry.nodes.get(levelId) : undefined
      const device = getEmulatedXRDevice()
      if (levelNode?.type !== 'level' || !device) return false
      await device.remote.dispatch('set_transform', {
        device: `${inputKind}-left`,
        orientation: { w: 1, x: 0, y: 0, z: 0 },
        position: { x: -3, y: 1.5, z: 0 },
      })
      const buildingObject = levelNode.parentId
        ? sceneRegistry.nodes.get(levelNode.parentId)
        : undefined
      levelObject?.updateWorldMatrix(true, false)
      buildingObject?.updateWorldMatrix(true, false)
      const target = new Object3D()
      const localPoint = new Vector3(point[0], levelNode.baseElevation, point[1])
      target.position.copy(
        levelObject
          ? levelObject.localToWorld(new Vector3(point[0], 0, point[1]))
          : buildingObject
            ? buildingObject.localToWorld(localPoint)
            : localPoint,
      )
      const normal = new Vector3(0, 1, 0)
      if (levelObject) normal.transformDirection(levelObject.matrixWorld)
      else if (buildingObject) normal.transformDirection(buildingObject.matrixWorld)
      target.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), normal)
      target.updateMatrixWorld(true)
      let distance = 1.25
      if (fromViewer) {
        const controllerPosition = camera.getWorldPosition(new Vector3()).add(new Vector3(0.2, -0.35, -0.15))
        const direction = controllerPosition.sub(target.position)
        distance = direction.length()
        target.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), direction.normalize())
        target.updateMatrixWorld(true)
      }
      if (!(await setInputPose(target, inputKind, distance))) return false
      await waitForXRFrames(2)
      globalThis.__aedifexXRLastGridEvent = undefined
      await setSelectValueAndWait(1, inputKind, 'selectstart')
      await setSelectValueAndWait(0, inputKind, 'selectend')
      await waitForXRFrames(2)
      const lastGridEvent = globalThis.__aedifexXRLastGridEvent as string | undefined
      return lastGridEvent?.startsWith('click:') === true
    }

    const clickNode = async (nodeId: string, inputKind: InputKind = 'controller') => {
      if (!(await aimAtNode(nodeId, inputKind))) return false
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (attempt > 0 && !(await aimAtNode(nodeId, inputKind))) return false
        await setSelectValueAndWait(1, inputKind, 'selectstart')
        await setSelectValueAndWait(0, inputKind, 'selectend')
        if (useViewer.getState().selection.selectedIds.includes(nodeId)) return true
      }
      return false
    }

    const sculptLevelPoints = async (
      points: [number, number][],
      inputKind: InputKind = 'controller',
    ) => {
      const first = points[0]
      if (!(first && (await prepareInput(inputKind)))) return false
      const levelId = useViewer.getState().selection.levelId
      const levelNode = levelId ? useScene.getState().nodes[levelId] : undefined
      const device = getEmulatedXRDevice()
      if (levelNode?.type !== 'level' || !device) return false
      const buildingObject = levelNode.parentId
        ? sceneRegistry.nodes.get(levelNode.parentId)
        : undefined
      buildingObject?.updateWorldMatrix(true, false)
      const setPoint = async (point: [number, number]) => {
        const target = new Object3D()
        const localPoint = new Vector3(point[0], levelNode.baseElevation, point[1])
        target.position.copy(buildingObject ? buildingObject.localToWorld(localPoint) : localPoint)
        const normal = new Vector3(0, 1, 0)
        if (buildingObject) normal.transformDirection(buildingObject.matrixWorld)
        target.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), normal)
        target.updateMatrixWorld(true)
        return setInputPose(target, inputKind, 1.25)
      }
      const siteId = useScene.getState().rootNodeIds[0]
      const beforeSite = siteId ? useScene.getState().nodes[siteId] : undefined
      const before = beforeSite?.type === 'site' ? beforeSite.terrain : undefined
      if (!(await setPoint(first))) return false
      if (!(await setSelectValueAndWait(1, inputKind, 'selectstart'))) return false
      for (const point of points.slice(1)) {
        if (!(await setPoint(point))) {
          await setSelectValue(0, inputKind)
          return false
        }
        await waitForXRFrames(2)
      }
      if (!(await setSelectValueAndWait(0, inputKind, 'selectend'))) return false
      await waitForXRFrames(2)
      const afterSite = siteId ? useScene.getState().nodes[siteId] : undefined
      const after = afterSite?.type === 'site' ? afterSite.terrain : undefined
      return JSON.stringify(after) !== JSON.stringify(before)
    }

    const clickNodeSurface = async (nodeId: string, inputKind: InputKind = 'controller') => {
      const aimAtNodeFace = async () => {
        if (!(await prepareInput(inputKind))) return false
        const registered = sceneRegistry.nodes.get(nodeId)
        const device = getEmulatedXRDevice()
        if (!(registered && device)) return false
        await device.remote.dispatch('set_transform', {
          device: `${inputKind}-left`,
          orientation: { w: 1, x: 0, y: 0, z: 0 },
          position: { x: -3, y: 1.5, z: 0 },
        })
        registered.updateWorldMatrix(true, true)
        const target = new Object3D()
        const bounds = new Box3().setFromObject(registered)
        if (bounds.isEmpty()) registered.getWorldPosition(target.position)
        else bounds.getCenter(target.position)
        registered.getWorldQuaternion(target.quaternion)
        target.updateMatrixWorld(true)
        const positioned = await setInputPose(target, inputKind, 0.2)
        if (positioned) await waitForXRFrames(2)
        return positioned
      }

      if (!(await aimAtNodeFace())) return false
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (attempt > 0 && !(await aimAtNodeFace())) return false
        globalThis.__aedifexXRLastNodeEvent = undefined
        await setSelectValueAndWait(1, inputKind, 'selectstart')
        await setSelectValueAndWait(0, inputKind, 'selectend')
        await waitForXRFrames(2)
        if (globalThis.__aedifexXRLastNodeEvent === `click:${nodeId}`) return true
      }
      return false
    }

    const drag = async (names: string[], inputKind: InputKind = 'controller') => {
      const first = names[0]
      if (!(first && (await aimAt(first, inputKind)))) return false
      await setSelectValueAndWait(1, inputKind, 'selectstart')
      await waitForXRFrames(2)
      for (const name of names.slice(1)) {
        if (!(await aimAt(name, inputKind))) {
          await setSelectValue(0, inputKind)
          return false
        }
      }
      await setSelectValueAndWait(0, inputKind, 'selectend')
      await waitForXRFrames()
      return globalThis.__aedifexXRLastPointerEvent === `click:${names.at(-1)}`
    }

    const dragNodeTo = async (
      nodeId: string,
      worldPoint: [number, number, number],
      inputKind: InputKind = 'controller',
    ) => {
      const registered = sceneRegistry.nodes.get(nodeId)
      if (!registered) return false
      if (!useViewer.getState().selection.selectedIds.includes(nodeId)) {
        if (!(await clickNode(nodeId, inputKind))) return false
      }
      const initialNodeState = JSON.stringify(useScene.getState().nodes[nodeId as AnyNodeId])
      if (!(await aimAtNode(nodeId, inputKind))) return false
      await setSelectValueAndWait(1, inputKind, 'selectstart')
      await waitForXRFrames(2)
      const floorTarget = new Object3D()
      floorTarget.position.fromArray(worldPoint)
      floorTarget.rotation.x = -Math.PI / 2
      floorTarget.updateMatrixWorld(true)
      await setInputPose(floorTarget, inputKind, 1.25)
      await waitForXRFrames(2)
      await setSelectValueAndWait(0, inputKind, 'selectend')
      await waitForXRFrames()
      return JSON.stringify(useScene.getState().nodes[nodeId as AnyNodeId]) !== initialNodeState
    }

    const probe = async (name: string, inputKind: InputKind = 'controller') => {
      const device = getEmulatedXRDevice()
      if (!device) return { error: 'missing device' }
      await aimAt(name, inputKind)
      const target = findTarget(name)
      if (!target) return { error: 'missing target' }
      const transform = (await device.remote.dispatch('get_transform', {
        device: `${inputKind}-right`,
      })) as {
        orientation: { w: number; x: number; y: number; z: number }
        position: { x: number; y: number; z: number }
      }
      const rayOrigin = new Vector3(
        transform.position.x,
        transform.position.y,
        transform.position.z,
      ).applyMatrix4(origin.matrixWorld)
      const rayDirection = new Vector3(0, 0, -1)
        .applyQuaternion(
          new Quaternion(
            transform.orientation.x,
            transform.orientation.y,
            transform.orientation.z,
            transform.orientation.w,
          ),
        )
        .transformDirection(origin.matrixWorld)
      const raycaster = new Raycaster(rayOrigin, rayDirection)
      raycaster.layers.enableAll()
      return {
        rayDirection: rayDirection.toArray(),
        rayOrigin: rayOrigin.toArray(),
        targetPosition: target.getWorldPosition(new Vector3()).toArray(),
        firstHits: raycaster
          .intersectObjects(scene.children, true)
          .slice(0, 8)
          .map((hit) => ({ distance: hit.distance, name: hit.object.name })),
        targetHits: raycaster.intersectObject(target, false).length,
      }
    }

    const probeNode = async (
      nodeId: string,
      inputKind: InputKind = 'controller',
      distance = 1.25,
    ) => {
      const registered = sceneRegistry.nodes.get(nodeId)
      const device = getEmulatedXRDevice()
      if (!(registered && device && (await aimAtNode(nodeId, inputKind, distance)))) {
        return { error: 'missing node or device' }
      }
      const transform = (await device.remote.dispatch('get_transform', {
        device: `${inputKind}-right`,
      })) as {
        orientation: { w: number; x: number; y: number; z: number }
        position: { x: number; y: number; z: number }
      }
      const rayOrigin = new Vector3(
        transform.position.x,
        transform.position.y,
        transform.position.z,
      ).applyMatrix4(origin.matrixWorld)
      const rayDirection = new Vector3(0, 0, -1)
        .applyQuaternion(
          new Quaternion(
            transform.orientation.x,
            transform.orientation.y,
            transform.orientation.z,
            transform.orientation.w,
          ),
        )
        .transformDirection(origin.matrixWorld)
      const raycaster = new Raycaster(rayOrigin, rayDirection)
      raycaster.layers.enableAll()
      registered.updateWorldMatrix(true, true)
      const registeredBounds = new Box3().setFromObject(registered)
      const describeHit = (object: Object3D) => {
        const path: {
          childTargets: string[]
          eventCount: number
          name: string
          type: string
        }[] = []
        let current: Object3D | null = object
        while (current && path.length < 8) {
          path.push({
            childTargets: current.children
              .filter(
                (child) =>
                  ((child as Object3D & { __r3f?: { eventCount?: number } }).__r3f?.eventCount ??
                    0) > 0,
              )
              .map((child) => child.name || child.type),
            eventCount:
              (current as Object3D & { __r3f?: { eventCount?: number } }).__r3f?.eventCount ?? 0,
            name: current.name,
            type: current.type,
          })
          current = current.parent
        }
        return path
      }
      return {
        bounds: registeredBounds.isEmpty()
          ? null
          : {
              max: registeredBounds.max.toArray(),
              min: registeredBounds.min.toArray(),
            },
        childCount: registered.children.length,
        firstHits: raycaster
          .intersectObjects(scene.children, true)
          .slice(0, 8)
          .map((hit) => ({
            distance: hit.distance,
            name: hit.object.name,
            path: describeHit(hit.object),
          })),
        nodeHits: raycaster.intersectObject(registered, true).length,
        rayDirection: rayDirection.toArray(),
        rayOrigin: rayOrigin.toArray(),
        registeredPosition: registered.getWorldPosition(new Vector3()).toArray(),
      }
    }

    let dragTrace: unknown[] = []
    const harness: XREmulatorTestHarness = {
      readWristWatch: () => {
        const watch = scene.getObjectByName('xr-wrist-watch')
        const face = scene.getObjectByName('xr-workspace-hand-shortcut')
        const position = watch?.getWorldPosition(new Vector3())
        return {
          tracked: watch?.visible ?? false,
          faceVisible: face?.visible ?? false,
          position: position?.toArray(),
          mode: useXRPlayerMode.getState().mode,
        }
      },
      readGrid: () => {
        const grid = scene.getObjectByName('aedifex-editor-grid-input')
        return {
          visible: grid?.visible,
          localPosition: grid?.position.toArray(),
          worldPosition: grid?.getWorldPosition(new Vector3()).toArray(),
          gridMask: grid?.layers.mask,
          cameraMask: camera.layers.mask,
          eyeMasks: (camera as typeof camera & { cameras?: typeof camera[] }).cameras?.map(eye => eye.layers.mask),
        }
      },
      setTestSceneTransform: async (scale, position, yaw) => {
        const root = scene.getObjectByName('xr-player-scene-root')
        if (!root || !Number.isFinite(scale) || scale <= 0) return false
        root.scale.setScalar(scale)
        root.position.set(...position)
        root.rotation.y = yaw
        root.updateWorldMatrix(true, true)
        await waitForXRFrames(3)
        return true
      },
      readDragTrace: () => dragTrace,
      setSnappingMode: (context, mode) => useEditor.getState().setSnappingMode(context, mode),
      pressPanelReleaseOnNode: async (name, nodeId, inputKind = 'controller') => {
        const events: string[] = []
        const record = (event: NodeEvent) => events.push(`node:click:${event.node.id}`)
        emitter.on('node:click', record)
        try {
          const aimed = await aimAt(name, inputKind)
          if (!aimed) return { aimed }
          await setSelectValueAndWait(1, inputKind, 'selectstart')
          await aimAtNode(nodeId, inputKind)
          await setSelectValueAndWait(0, inputKind, 'selectend')
          await waitForXRFrames(3)
          return { aimed, events }
        } finally {
          emitter.off('node:click', record)
        }
      },
      clickFloorFromViewer: (point, inputKind) => clickLevelPoint(point, inputKind, true),
      clickPanelOnce: async (name, inputKind = 'controller') => {
        const events: string[] = []
        const grid = () => events.push('grid:click')
        const node = (event: NodeEvent) => events.push(`node:click:${event.node.id}`)
        emitter.on('grid:click', grid)
        emitter.on('node:click', node)
        try {
          const aimed = await aimAt(name, inputKind)
          if (!aimed) return { aimed }
          const started = await setSelectValueAndWait(1, inputKind, 'selectstart')
          const ended = await setSelectValueAndWait(0, inputKind, 'selectend')
          await waitForXRFrames(3)
          return { aimed, started, ended, events }
        } finally {
          emitter.off('grid:click', grid)
          emitter.off('node:click', node)
        }
      },
      clickNodeOnce: async (nodeId) => {
        const events: unknown[] = []
        const selected = (node: AnyNode) => events.push({ intent: node.id, selected: useViewer.getState().selection.selectedIds })
        const unsubscribe = useViewer.subscribe((state, previous) => {
          if (state.selection.selectedIds !== previous.selection.selectedIds) events.push({ selected: state.selection.selectedIds })
        })
        emitter.on('selection:canvas-node-click', selected)
        try {
          if (!(await aimAtNode(nodeId, 'controller'))) return { aimed: false }
          await setSelectValueAndWait(1, 'controller', 'selectstart')
          await setSelectValueAndWait(0, 'controller', 'selectend')
          await waitForXRFrames(3)
          return { events }
        } finally {
          unsubscribe()
          emitter.off('selection:canvas-node-click', selected)
        }
      },
      snapTurn: async () => {
        const device = getEmulatedXRDevice()
        if (!device || !(await prepareInput('controller'))) return false
        try {
          await device.remote.dispatch('set_gamepad_state', {
            device: 'controller-right', axes: [{ index: 0, value: 1 }],
          })
          await waitForXRFrames(3)
        } finally {
          await device.remote.dispatch('set_gamepad_state', {
            device: 'controller-right', axes: [{ index: 0, value: 0 }],
          })
          await waitForXRFrames(2)
        }
        return true
      },
      moveViewer: async (delta, yaw) => {
        const device = getEmulatedXRDevice()
        if (!device) return false
        const transform = await device.remote.dispatch('get_transform', { device: 'headset' }) as {
          position: { x: number; y: number; z: number }
          orientation: { x: number; y: number; z: number; w: number }
        }
        const rotation = yaw === undefined ? transform.orientation : {
          x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2),
        }
        await device.remote.dispatch('set_transform', {
          device: 'headset',
          position: { x: transform.position.x + delta[0], y: transform.position.y + delta[1], z: transform.position.z + delta[2] },
          orientation: rotation,
        })
        await waitForXRFrames(3)
        return true
      },
      setPlayerMode: async (mode) => {
        if (mode !== 'god' && mode !== 'human') throw new Error('Invalid player mode')
        useXRPlayerMode.getState().setMode(mode)
        await waitForXRFrames(3)
      },
      scrollViews: () => {
        const views: { name: string; offset: number }[] = []
        scene.traverseVisible((object) => {
          if (object.name.endsWith('-scroll')) views.push({ name: object.name, offset: object.userData.scrollOffset ?? 0 })
        })
        return views
      },
      dragSpatial: async (name, delta, inputKind = 'controller') => {
        const source = findTarget(name)
        if (!source || !(await aimAt(name, inputKind))) return false
        const target = new Object3D()
        source.getWorldPosition(target.position)
        source.getWorldQuaternion(target.quaternion)
        target.updateMatrixWorld(true)
        try {
          if (!(await setSelectValueAndWait(1, inputKind, 'selectstart'))) return false
          for (let step = 0; step < 12; step += 1) {
            target.position.addScaledVector(new Vector3(...delta), 1 / 12)
            target.updateMatrixWorld(true)
            await setInputPose(target, inputKind, 0.5)
            await waitForXRFrames(2)
          }
        } finally {
          await setSelectValueAndWait(0, inputKind, 'selectend')
        }
        await waitForXRFrames(2)
        return true
      },
      listHandles: () => {
        const handles: { id: string; position: number[] }[] = []
        scene.traverseVisible((object) => {
          if (object.userData.editorHandleHitArea === true) {
            handles.push({
              id: object.uuid,
              position: object.getWorldPosition(new Vector3()).toArray(),
            })
          }
        })
        return handles
      },
      dragHandle: async (id, delta, inputKind = 'controller') => {
        const handle = scene.getObjectByProperty('uuid', id)
        if (!handle || !(await prepareInput(inputKind))) return false
        const target = new Object3D()
        handle.getWorldPosition(target.position)
        // Curved-arrow hit areas are torus arcs; their origin is in the empty
        // centre, so aim at the middle of the arc rather than the pivot.
        const geometry = (handle as Object3D & { geometry?: { type: string; parameters?: { radius?: number } } }).geometry
        if (geometry?.type === 'TorusGeometry' && geometry.parameters?.radius) {
          target.position.copy(handle.localToWorld(new Vector3(geometry.parameters.radius, 0, 0)))
        }
        target.lookAt(target.position.clone().add(new Vector3(0, 0.5, 0.5)))
        target.updateMatrixWorld(true)
        const before = JSON.stringify(useScene.getState().nodes)
        const selectedId = useViewer.getState().selection.selectedIds[0]
        dragTrace = []
        const sample = () => {
          if (!selectedId) return
          dragTrace.push(JSON.parse(JSON.stringify({
            node: useScene.getState().nodes[selectedId as AnyNodeId],
            override: useLiveNodeOverrides.getState().get(selectedId),
            scope: useInteractionScope.getState().scope.kind,
          })))
        }
        await setInputPose(target, inputKind, 0.5)
        await waitForXRFrames(2)
        try {
          await setSelectValueAndWait(1, inputKind, 'selectstart')
          for (let step = 0; step < 10; step += 1) {
            target.position.addScaledVector(new Vector3(...delta), 0.1)
            target.updateMatrixWorld(true)
            await setInputPose(target, inputKind, 0.5)
            await waitForXRFrames(2)
            sample()
          }
        } finally {
          await setSelectValueAndWait(0, inputKind, 'selectend')
        }
        await waitForXRFrames(2)
        sample()
        return JSON.stringify(useScene.getState().nodes) !== before
      },
      aimAt,
      aimAtNode,
      click,
      clickLevelPoint,
      clickNode,
      clickNodeSurface,
      drag,
      dragWorkspace: async (delta, inputKind = 'controller') => {
        if (!(await aimAt('xr-workspace-drag-handle', inputKind))) return false
        const device = getEmulatedXRDevice()
        const workspace = findTarget('xr-editor-wand-panel')
        if (!device || !workspace) return false
        const before = workspace.position.clone()
        const deviceId = `${inputKind}-right`
        const transform = (await device.remote.dispatch('get_transform', { device: deviceId })) as {
          orientation: { w: number; x: number; y: number; z: number }
          position: { x: number; y: number; z: number }
        }
        try {
          if (!(await setSelectValueAndWait(1, inputKind, 'selectstart'))) return false
          await device.remote.dispatch('set_transform', {
            device: deviceId,
            orientation: transform.orientation,
            position: {
              x: transform.position.x + delta[0],
              y: transform.position.y + delta[1],
              z: transform.position.z + delta[2],
            },
          })
          await waitForXRFrames(3)
          return workspace.position.distanceTo(before) > 0.01
        } finally {
          await setSelectValueAndWait(0, inputKind, 'selectend')
        }
      },
      dragNodeTo,
      listSceneNodes: () =>
        Object.values(useScene.getState().nodes)
          .filter((node): node is NonNullable<typeof node> => node != null)
          .map((node) => ({
            id: node.id,
            parentId: node.parentId,
            type: node.type,
          }))
          .sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id)),
      listSpatialTargets: () => {
        const names = new Set<string>()
        scene.traverseVisible((object) => {
          if (object.name.startsWith('xr-') && 'raycast' in object) names.add(object.name)
        })
        return [...names].sort()
      },
      placeToolOnGrid: async (toolTarget, nodeType, points, inputKind = 'controller') => {
        const before = new Set(
          Object.values(useScene.getState().nodes)
            .filter((node) => node?.type === nodeType)
            .map((node) => node!.id),
        )
        const activated = await click(toolTarget, inputKind)
        let deliveredPoints = 0
        if (activated) {
          await waitForXRFrames(2)
          for (const point of points) {
            if (!(await clickLevelPoint(point, inputKind))) break
            deliveredPoints += 1
          }
        }
        const createdNodeIds = Object.values(useScene.getState().nodes)
          .filter((node): node is AnyNode => node?.type === nodeType && !before.has(node.id))
          .map((node) => node.id)
        const cancelled = await click('xr-build-tool-select', inputKind)
        return { activated, cancelled, createdNodeIds, deliveredPoints }
      },
      placeToolOnNode: async (toolTarget, hostNodeId, nodeType, inputKind = 'controller') => {
        const before = new Set(
          Object.values(useScene.getState().nodes)
            .filter((node) => node?.type === nodeType)
            .map((node) => node!.id),
        )
        const activated = await click(toolTarget, inputKind)
        if (activated) await waitForXRFrames(2)
        const deliveredHostClick = activated && (await clickNodeSurface(hostNodeId, inputKind))
        const createdNodes = Object.values(useScene.getState().nodes).filter(
          (node): node is AnyNode => node?.type === nodeType && !before.has(node.id),
        )
        const attachedToHost =
          createdNodes.length > 0 && createdNodes.every((node) => node.parentId === hostNodeId)
        const alreadySelect =
          useEditor.getState().mode === 'select' && useEditor.getState().tool === null
        const cancelled = alreadySelect || (await click('xr-build-tool-select', inputKind))
        return {
          activated,
          attachedToHost,
          cancelled,
          createdNodeIds: createdNodes.map((node) => node.id),
          deliveredHostClick,
        }
      },
      panGodView,
      probe,
      probeNode,
      readNode: (nodeId) => useScene.getState().nodes[nodeId as AnyNode['id']],
      sculptLevelPoints,
      snapshot: () => {
        const godViewRoot = findTarget('xr-player-scene-root')
        const workspace = findTarget('xr-editor-wand-panel')
        const nodeCounts: Record<string, number> = {}
        for (const node of Object.values(useScene.getState().nodes)) {
          if (node) nodeCounts[node.type] = (nodeCounts[node.type] ?? 0) + 1
        }
        return {
          activePaintMaterial: useEditor.getState().activePaintMaterial?.materialPreset ?? null,
          godViewTransform: godViewRoot
            ? {
                position: godViewRoot.position.toArray(),
                rotationY: godViewRoot.rotation.y,
                scale: godViewRoot.scale.toArray(),
              }
            : null,
          history: getHistoryCommandState(),
          hoveredTarget: globalThis.__aedifexXRHoveredTarget,
          lastGridEvent: globalThis.__aedifexXRLastGridEvent,
          lastNodeEvent: globalThis.__aedifexXRLastNodeEvent,
          lastPointerEvent: globalThis.__aedifexXRLastPointerEvent,
          levelId: useViewer.getState().selection.levelId,
          mode: useEditor.getState().mode,
          nodeCounts,
          paintEraser: useEditor.getState().paintEraser,
          paintHover: useEditor.getState().paintHover,
          paintScope: useEditor.getState().paintScope,
          terrainBrush: useEditor.getState().terrainBrush,
          terrainSampling: useEditor.getState().terrainSampling,
          terrainVerb: useEditor.getState().terrainVerb,
          wandPanelScale: useXRWandPanelSettings.getState().panelScale,
          playerMode: useXRPlayerMode.getState().mode,
          workspaceRecallRequest: useXRWorkspace.getState().recallRequest,
          workspace: workspace
            ? {
                recallPosition: workspace.parent?.position.toArray() ?? [],
                recallQuaternion: workspace.parent?.quaternion.toArray() ?? [],
                localPosition: workspace.position.toArray(),
                quaternion: workspace.getWorldQuaternion(new Quaternion()).toArray(),
                position: workspace.getWorldPosition(new Vector3()).toArray(),
                scale: workspace.children[0]?.getWorldScale(new Vector3()).toArray() ?? [],
                contentVisible: !!findTarget('xr-workspace-content'),
                dragging: workspace.userData.dragging === true,
              }
            : null,
          wallSnappingMode: useEditor.getState().snappingModeByContext.wall,
          scope: useInteractionScope.getState().scope.kind,
          selectedIds: useViewer.getState().selection.selectedIds,
          siteHasTerrain: Object.values(useScene.getState().nodes).some(
            (node) => node?.type === 'site' && node.terrain !== undefined,
          ),
          tool: useEditor.getState().tool,
          toolDefaults: useEditor.getState().toolDefaults,
        }
      },
      version: 1,
    }
    globalThis.__aedifexXRTestHarness = harness
    const removeControls = getEmulatedXRDevice() ? mountEmulatorTestControls(harness) : () => undefined
    return () => {
      removeControls()
      emitter.off('node:click', recordNodeClick)
      emitter.off('node:pointerdown', recordNodeDown)
      emitter.off('grid:click', recordGridClick)
      if (globalThis.__aedifexXRTestHarness === harness) {
        globalThis.__aedifexXRTestHarness = undefined
      }
    }
  }, [camera, origin, scene, session])

  return null
}
