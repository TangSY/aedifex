import { beforeEach, expect, test } from 'bun:test'
import {
  applySceneOperationPatch,
  BuildingNode,
  DuctFittingNode,
  DuctSegmentNode,
  LevelNode,
  PipeFittingNode,
  PipeSegmentNode,
  SiteNode,
  useScene,
} from '@aedifex/core'
import { useEditor, useInteractionScope } from '@aedifex/editor'
import { useViewer } from '@aedifex/viewer'
import { useThree } from '@react-three/fiber'
import { act } from '@react-three/test-renderer'
import { useMemo } from 'react'
import { type Camera, Vector3 } from 'three'
import { installMountedScene, LevelScene, mount, settle } from '../__tests__/harness'
import { ductFittingDefinition } from '../duct-fitting/definition'
import { getDuctFittingPorts } from '../duct-fitting/ports'
import DuctFittingSelection from '../duct-fitting/selection'
import { ductSegmentDefinition } from '../duct-segment/definition'
import { pipeFittingDefinition } from '../pipe-fitting/definition'
import { getPipeFittingPorts } from '../pipe-fitting/ports'
import PipeFittingSelection from '../pipe-fitting/selection'
import { pipeSegmentDefinition } from '../pipe-segment/definition'

installMountedScene()
beforeEach(() => Object.assign(window, { requestAnimationFrame, cancelAnimationFrame }))
const site = SiteNode.parse({})
const building = BuildingNode.parse({ parentId: site.id })
const level = LevelNode.parse({ parentId: building.id })
let camera: Camera

function Scene({ kind }: { kind: 'pipe' | 'duct' }) {
  const three = useThree()
  useMemo(() => {
    three.camera.position.set(1, 6, 4)
    three.camera.lookAt(1, 1, 0)
    three.camera.updateMatrixWorld()
    three.gl.domElement.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 1000, height: 1000 }) as DOMRect
    camera = three.camera
  }, [three])
  return (
    <>
      <LevelScene level={level} />
      {kind === 'pipe' ? <PipeFittingSelection /> : <DuctFittingSelection />}
    </>
  )
}
function pointerAt(point: [number, number, number]) {
  const p = new Vector3(...point).project(camera)
  return { clientX: ((p.x + 1) / 2) * 1000, clientY: ((1 - p.y) / 2) * 1000 }
}

test.each([
  ['pipe', 'pointer'],
  ['duct', 'pointer'],
  ['pipe', 'selection'],
  ['duct', 'selection'],
  ['pipe', 'remote'],
  ['duct', 'remote'],
  ['pipe', 'remote-up'],
  ['duct', 'remote-up'],
  ['pipe', 'remote-move'],
  ['duct', 'remote-move'],
  ['pipe', 'remote-first'],
  ['duct', 'remote-first'],
  ['pipe', 'remote-follower-first'],
  ['duct', 'remote-follower-first'],
  ['pipe', 'release'],
  ['duct', 'release'],
  ['pipe', 'return'],
  ['duct', 'return'],
  ['pipe', 'grid'],
  ['duct', 'grid'],
  ['pipe', 'alt'],
  ['duct', 'alt'],
] as const)('%s fitting move handles %s', async (kind, end) => {
  const fitting =
    kind === 'pipe'
      ? PipeFittingNode.parse({
          ...pipeFittingDefinition.defaults(),
          parentId: level.id,
          position: [1, 1, 0],
        })
      : DuctFittingNode.parse({
          ...ductFittingDefinition.defaults(),
          parentId: level.id,
          position: [1, 1, 0],
        })
  const port =
    kind === 'pipe'
      ? getPipeFittingPorts(fitting as PipeFittingNode)[0]!
      : getDuctFittingPorts(fitting as DuctFittingNode)[0]!
  const start: [number, number, number] = [...port.position]
  const follower =
    kind === 'pipe'
      ? PipeSegmentNode.parse({
          ...pipeSegmentDefinition.defaults(),
          parentId: level.id,
          path: [start, [start[0] - 2, start[1], start[2]]],
        })
      : DuctSegmentNode.parse({
          ...ductSegmentDefinition.defaults(),
          parentId: level.id,
          path: [start, [start[0] - 2, start[1], start[2]]],
        })
  const nodes = [
    { ...site, children: [building.id] },
    { ...building, children: [level.id] },
    { ...level, children: [fitting.id, follower.id] },
    fitting,
    follower,
  ]
  useScene.setState({
    nodes: Object.fromEntries(nodes.map((node) => [node.id, node])),
    rootNodeIds: [site.id],
    dirtyNodes: new Set(nodes.map((node) => node.id)),
    readOnly: false,
  })
  useScene.temporal.getState().resume()
  useScene.temporal.getState().clear()
  useEditor.setState((state) => ({
    mode: 'select',
    tool: null,
    gridSnapStep: 0.5,
    snappingModeByContext: {
      ...state.snappingModeByContext,
      item: end === 'grid' || end === 'alt' ? 'grid' : 'lines',
    },
  }))
  useViewer.setState({
    selection: {
      buildingId: building.id,
      levelId: level.id,
      zoneId: null,
      selectedIds: [fitting.id],
    },
  })
  const renderer = await mount(<Scene kind={kind} />)
  await settle(renderer)
  const meshes = () =>
    renderer.scene.findAll(
      (item) =>
        typeof item.props.onPointerDown === 'function' &&
        (item.instance as { isMesh?: boolean }).isMesh === true,
    )
  const cube = meshes().find(
    (item) => item.instance.getWorldPosition(new Vector3()).distanceTo(new Vector3(1, 1, 0)) < 1e-6,
  )!
  await renderer.fireEvent(cube, 'pointerDown', {
    nativeEvent: {
      button: 0,
      ...pointerAt([1, 1, 0]),
      stopPropagation() {},
      stopImmediatePropagation() {},
    },
  })
  await settle(renderer)
  const arrow = meshes()
    .filter((item) => {
      const p = item.instance.getWorldPosition(new Vector3())
      return p.x > 1.1 && Math.abs(p.y - 1) < 1e-6 && Math.abs(p.z) < 1e-6
    })
    .at(-1)!
  expect(arrow).toBeDefined()
  const grip = arrow.instance.getWorldPosition(new Vector3())
  await renderer.fireEvent(arrow, 'pointerDown', {
    nativeEvent: {
      button: 0,
      ...pointerAt([grip.x, grip.y, grip.z]),
      stopPropagation() {},
      stopImmediatePropagation() {},
    },
  })
  await settle(renderer)
  const location = pointerAt([grip.x + 0.7, grip.y, grip.z])
  if (end === 'remote-first' || end === 'remote-follower-first') {
    await act(async () => {
      applySceneOperationPatch({
        materialChanges: [],
        nodeCreates: [],
        nodeDeletes: [],
        nodeUpdates:
          end === 'remote-first'
            ? [{ id: fitting.id, data: { position: [4, 1, 0] }, removeFields: [] }]
            : [
                {
                  id: follower.id,
                  data: {
                    path: [
                      [-4, 1, 0],
                      [-3, 1, 0],
                    ],
                  },
                  removeFields: [],
                },
              ],
      })
      window.dispatchEvent(Object.assign(new Event('pointermove'), { button: 0, ...location }))
      window.dispatchEvent(Object.assign(new Event('pointerup'), { button: 0, ...location }))
    })
    expect((useScene.getState().nodes[fitting.id] as typeof fitting).position).toEqual(
      end === 'remote-first' ? [4, 1, 0] : fitting.position,
    )
    expect((useScene.getState().nodes[follower.id] as typeof follower).path).toEqual(
      end === 'remote-first'
        ? follower.path
        : [
            [-4, 1, 0],
            [-3, 1, 0],
          ],
    )
    expect(useScene.temporal.getState().pastStates).toHaveLength(0)
    expect(useViewer.getState().inputDragging).toBe(false)
    return
  }
  await act(async () => {
    window.dispatchEvent(
      Object.assign(new Event('pointermove'), { button: 0, altKey: end === 'alt', ...location }),
    )
  })
  expect((useScene.getState().nodes[fitting.id] as typeof fitting).position).not.toEqual(
    fitting.position,
  )
  expect((useScene.getState().nodes[follower.id] as typeof follower).path).not.toEqual(
    follower.path,
  )
  if (end === 'grid' || end === 'alt') {
    const moved = (useScene.getState().nodes[fitting.id] as typeof fitting).position[0]
    expect(moved).toBeCloseTo(end === 'grid' ? 1.5 : 1.7)
  }
  if (end === 'return') {
    const origin = pointerAt([grip.x, grip.y, grip.z])
    await act(async () => {
      window.dispatchEvent(Object.assign(new Event('pointermove'), { button: 0, ...origin }))
    })
    expect((useScene.getState().nodes[follower.id] as typeof follower).path).toEqual(follower.path)
  }

  if (end === 'remote' || end === 'remote-up' || end === 'remote-move') {
    await act(async () => {
      applySceneOperationPatch({
        materialChanges: [],
        nodeCreates: [],
        nodeDeletes: [],
        nodeUpdates: [{ id: fitting.id, data: { position: [4, 1, 0] }, removeFields: [] }],
      })
      if (end === 'remote')
        window.dispatchEvent(Object.assign(new Event('pointercancel'), { button: 0, ...location }))
      if (end === 'remote-move')
        window.dispatchEvent(
          Object.assign(new Event('pointermove'), {
            button: 0,
            ...pointerAt([grip.x + 1.2, grip.y, grip.z]),
          }),
        )
    })
  }
  await act(async () => {
    if (end === 'pointer')
      window.dispatchEvent(Object.assign(new Event('pointercancel'), { button: 0, ...location }))
    if (end === 'selection')
      useViewer.setState((state) => ({ selection: { ...state.selection, selectedIds: [] } }))
  })
  await act(async () => {
    window.dispatchEvent(Object.assign(new Event('pointerup'), { button: 0, ...location }))
  })
  if (end === 'release' || end === 'grid' || end === 'alt') {
    expect((useScene.getState().nodes[fitting.id] as typeof fitting).position).not.toEqual(
      fitting.position,
    )
    expect(useScene.temporal.getState().pastStates).toHaveLength(1)
  } else {
    if (end === 'remote' || end === 'remote-up' || end === 'remote-move') {
      expect((useScene.getState().nodes[fitting.id] as typeof fitting).position).toEqual([4, 1, 0])
    } else
      expect((useScene.getState().nodes[fitting.id] as typeof fitting).position).toEqual(
        fitting.position,
      )
    expect((useScene.getState().nodes[follower.id] as typeof follower).path).toEqual(follower.path)
    expect(useScene.temporal.getState().pastStates).toHaveLength(0)
  }
  expect(useScene.temporal.getState().isTracking).toBe(true)
  expect(useViewer.getState().inputDragging).toBe(false)
  expect(useInteractionScope.getState().scope.kind).toBe('idle')
})

test.each([
  ['pipe', 'cancel'],
  ['duct', 'cancel'],
  ['pipe', 'release'],
  ['duct', 'release'],
] as const)('%s fitting resize handles %s', async (kind, end) => {
  const fitting =
    kind === 'pipe'
      ? PipeFittingNode.parse({
          ...pipeFittingDefinition.defaults(),
          parentId: level.id,
          position: [1, 1, 0],
        })
      : DuctFittingNode.parse({
          ...ductFittingDefinition.defaults(),
          parentId: level.id,
          position: [1, 1, 0],
        })
  const nodes = [
    { ...site, children: [building.id] },
    { ...building, children: [level.id] },
    { ...level, children: [fitting.id] },
    fitting,
  ]
  useScene.setState({
    nodes: Object.fromEntries(nodes.map((node) => [node.id, node])),
    rootNodeIds: [site.id],
    dirtyNodes: new Set(nodes.map((node) => node.id)),
    readOnly: false,
  })
  useScene.temporal.getState().resume()
  useScene.temporal.getState().clear()
  useEditor.setState({ mode: 'select', tool: null })
  useViewer.setState({
    selection: {
      buildingId: building.id,
      levelId: level.id,
      zoneId: null,
      selectedIds: [fitting.id],
    },
  })
  const renderer = await mount(<Scene kind={kind} />)
  await settle(renderer)
  const top = renderer.scene
    .findAll(
      (item) =>
        typeof item.props.onPointerDown === 'function' &&
        (item.instance as { isMesh?: boolean }).isMesh === true,
    )
    .find((item) => {
      const p = item.instance.getWorldPosition(new Vector3())
      return Math.abs(p.x - 1) < 1e-6 && p.y > 1.1 && Math.abs(p.z) < 1e-6
    })!
  expect(top).toBeDefined()
  const grip = top.instance.getWorldPosition(new Vector3())
  await renderer.fireEvent(top, 'pointerDown', {
    nativeEvent: {
      button: 0,
      ...pointerAt([grip.x, grip.y, grip.z]),
      stopPropagation() {},
      stopImmediatePropagation() {},
    },
  })
  await settle(renderer)
  const location = pointerAt([grip.x, grip.y + 0.2, grip.z])
  await act(async () => {
    window.dispatchEvent(Object.assign(new Event('pointermove'), { button: 0, ...location }))
  })
  const read = () => {
    const node = useScene.getState().nodes[fitting.id]!
    return kind === 'pipe' ? (node as PipeFittingNode).diameter : (node as DuctFittingNode).height
  }
  const original =
    kind === 'pipe' ? (fitting as PipeFittingNode).diameter : (fitting as DuctFittingNode).height
  expect(read()).not.toBe(original)
  if (end === 'cancel')
    await act(async () => {
      window.dispatchEvent(Object.assign(new Event('pointercancel'), { button: 0, ...location }))
    })
  await act(async () => {
    window.dispatchEvent(Object.assign(new Event('pointerup'), { button: 0, ...location }))
  })
  if (end === 'cancel') {
    expect(read()).toBe(original)
    expect(useScene.temporal.getState().pastStates).toHaveLength(0)
  } else {
    expect(read()).not.toBe(original)
    expect(useScene.temporal.getState().pastStates).toHaveLength(1)
  }
  expect(useScene.temporal.getState().isTracking).toBe(true)
  expect(useInteractionScope.getState().scope.kind).toBe('idle')
})

test.each([
  ['pipe', 'cancel'],
  ['duct', 'cancel'],
  ['pipe', 'release'],
  ['duct', 'release'],
] as const)('%s fitting rotation handles %s', async (kind, end) => {
  const fitting =
    kind === 'pipe'
      ? PipeFittingNode.parse({
          ...pipeFittingDefinition.defaults(),
          parentId: level.id,
          position: [1, 1, 0],
        })
      : DuctFittingNode.parse({
          ...ductFittingDefinition.defaults(),
          parentId: level.id,
          position: [1, 1, 0],
        })
  const nodes = [
    { ...site, children: [building.id] },
    { ...building, children: [level.id] },
    { ...level, children: [fitting.id] },
    fitting,
  ]
  useScene.setState({
    nodes: Object.fromEntries(nodes.map((node) => [node.id, node])),
    rootNodeIds: [site.id],
    dirtyNodes: new Set(nodes.map((node) => node.id)),
    readOnly: false,
  })
  useScene.temporal.getState().resume()
  useScene.temporal.getState().clear()
  useEditor.setState({ mode: 'select', tool: null })
  useViewer.setState({
    selection: {
      buildingId: building.id,
      levelId: level.id,
      zoneId: null,
      selectedIds: [fitting.id],
    },
  })
  const renderer = await mount(<Scene kind={kind} />)
  await settle(renderer)
  const meshes = () =>
    renderer.scene.findAll(
      (item) =>
        typeof item.props.onPointerDown === 'function' &&
        (item.instance as { isMesh?: boolean }).isMesh === true,
    )
  const cube = meshes().find(
    (item) => item.instance.getWorldPosition(new Vector3()).distanceTo(new Vector3(1, 1, 0)) < 1e-6,
  )!
  await renderer.fireEvent(cube, 'pointerDown', {
    nativeEvent: {
      button: 0,
      ...pointerAt([1, 1, 0]),
      stopPropagation() {},
      stopImmediatePropagation() {},
    },
  })
  await settle(renderer)
  const arc = meshes().find((item) => {
    const p = item.instance.getWorldPosition(new Vector3())
    return p.x > 1.1 && Math.abs(p.y - 1) < 1e-6 && p.z > 0.1
  })!
  expect(arc).toBeDefined()
  const grip = arc.instance.getWorldPosition(new Vector3())
  await renderer.fireEvent(arc, 'pointerDown', {
    nativeEvent: {
      button: 0,
      ...pointerAt([grip.x, grip.y, grip.z]),
      stopPropagation() {},
      stopImmediatePropagation() {},
    },
  })
  await settle(renderer)
  const location = pointerAt([1.6, 1, 0])
  await act(async () => {
    window.dispatchEvent(Object.assign(new Event('pointermove'), { button: 0, ...location }))
  })
  const read = () => (useScene.getState().nodes[fitting.id] as typeof fitting).rotation
  expect(read()).not.toEqual(fitting.rotation)
  if (end === 'cancel')
    await act(async () => {
      window.dispatchEvent(Object.assign(new Event('pointercancel'), { button: 0, ...location }))
    })
  await act(async () => {
    window.dispatchEvent(Object.assign(new Event('pointerup'), { button: 0, ...location }))
  })
  if (end === 'cancel') {
    expect(read()).toEqual(fitting.rotation)
    expect(useScene.temporal.getState().pastStates).toHaveLength(0)
  } else {
    expect(read()).not.toEqual(fitting.rotation)
    expect(useScene.temporal.getState().pastStates).toHaveLength(1)
  }
  expect(useScene.temporal.getState().isTracking).toBe(true)
  expect(useInteractionScope.getState().scope.kind).toBe('idle')
})
