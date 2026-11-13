import { beforeEach, expect, test } from 'bun:test'
import {
  type AnyNode,
  type AnyNodeId,
  applySceneOperationPatch,
  BuildingNode,
  emitter,
  LevelNode,
  LinesetNode,
  LiquidLineNode,
  SiteNode,
  useScene,
} from '@aedifex/core'
import { runUndo, useEditor, useInteractionScope } from '@aedifex/editor'
import { useViewer } from '@aedifex/viewer'
import { useThree } from '@react-three/fiber'
import { act } from '@react-three/test-renderer'
import { useMemo } from 'react'
import { type Camera, Vector3 } from 'three'
import { installMountedScene, LevelScene, mount, settle } from '../__tests__/harness'
import { linesetDefinition } from '../lineset/definition'
import LinesetSelection from '../lineset/selection'
import { liquidLineDefinition } from '../liquid-line/definition'
import LiquidSelection from '../liquid-line/selection'
import { createPathPointMoveAffordance } from './path-point-affordance'

installMountedScene()
beforeEach(() => Object.assign(window, { requestAnimationFrame, cancelAnimationFrame }))
const site = SiteNode.parse({})
const building = BuildingNode.parse({ parentId: site.id })
const level = LevelNode.parse({ parentId: building.id })
const path: [number, number, number][] = [
  [0, 1, 0],
  [2, 1, 0],
]
let camera: Camera
function Scene({ kind }: { kind: 'lineset' | 'liquid' }) {
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
      {kind === 'lineset' ? <LinesetSelection /> : <LiquidSelection />}
    </>
  )
}
function pointerAt(point: [number, number, number]) {
  const p = new Vector3(...point).project(camera)
  return { clientX: ((p.x + 1) / 2) * 1000, clientY: ((1 - p.y) / 2) * 1000 }
}
test.each([
  ['lineset', 'cancel'],
  ['liquid', 'cancel'],
  ['lineset', 'selection'],
  ['liquid', 'selection'],
  ['lineset', 'remote'],
  ['liquid', 'remote'],
  ['lineset', 'remote-up'],
  ['liquid', 'remote-up'],
  ['lineset', 'remote-move'],
  ['liquid', 'remote-move'],
  ['lineset', 'remote-first'],
  ['liquid', 'remote-first'],
  ['lineset', 'remote-follower-first'],
  ['liquid', 'remote-follower-first'],
  ['lineset', 'history'],
  ['liquid', 'history'],
  ['lineset', 'escape'],
  ['liquid', 'escape'],
  ['lineset', 'unmount'],
  ['liquid', 'unmount'],
  ['lineset', 'detach'],
  ['liquid', 'detach'],
  ['lineset', 'return'],
  ['liquid', 'return'],
  ['lineset', 'release'],
  ['liquid', 'release'],
  ['lineset', 'grid'],
  ['liquid', 'grid'],
  ['lineset', 'off'],
  ['liquid', 'off'],
  ['lineset', 'shift'],
  ['liquid', 'shift'],
] as const)('%s endpoint %s', async (kind, end) => {
  const makeNode = (p: [number, number, number][]) =>
    kind === 'lineset'
      ? LinesetNode.parse({ ...linesetDefinition.defaults(), parentId: level.id, path: p })
      : LiquidLineNode.parse({ ...liquidLineDefinition.defaults(), parentId: level.id, path: p })
  const line = makeNode(path)
  const follower = makeNode([
    [-2, 1, 0],
    [0, 1, 0],
  ])
  const nodes = [
    { ...site, children: [building.id] },
    { ...building, children: [level.id] },
    { ...level, children: [line.id, follower.id] },
    line,
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
      polygon: end === 'off' ? 'off' : 'grid',
    },
  }))
  useViewer.setState({
    selection: { buildingId: building.id, levelId: level.id, zoneId: null, selectedIds: [line.id] },
  })
  const renderer = await mount(<Scene kind={kind} />)
  await settle(renderer)
  const meshes = () =>
    renderer.scene.findAll(
      (item) =>
        typeof item.props.onPointerDown === 'function' &&
        (item.instance as { isMesh?: boolean }).isMesh === true,
    )
  const cube = meshes()
    .filter(
      (item) =>
        item.instance.getWorldPosition(new Vector3()).distanceTo(new Vector3(0, 1, 0)) < 1e-6,
    )
    .at(-1)!
  await renderer.fireEvent(cube, 'pointerDown', {
    nativeEvent: {
      button: 0,
      ...pointerAt([0, 1, 0]),
      stopPropagation() {},
      stopImmediatePropagation() {},
    },
  })
  await settle(renderer)
  const arrow = meshes()
    .filter((item) => {
      const p = item.instance.getWorldPosition(new Vector3())
      return p.x < -0.05 && p.x > -1 && Math.abs(p.y - 1) < 1e-6 && Math.abs(p.z) < 1e-6
    })
    .at(-1)!
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
  const location = pointerAt([
    grip.x + (end === 'grid' || end === 'off' || end === 'shift' ? 1.1 : 1),
    grip.y,
    grip.z,
  ])
  if (end === 'remote-first' || end === 'remote-follower-first') {
    await act(async () => {
      applySceneOperationPatch({
        materialChanges: [],
        nodeCreates: [],
        nodeDeletes: [],
        nodeUpdates:
          end === 'remote-first'
            ? [
                {
                  id: line.id,
                  data: {
                    path: [
                      [3, 1, 0],
                      [5, 1, 0],
                    ],
                  },
                  removeFields: [],
                },
              ]
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
    expect((useScene.getState().nodes[line.id] as typeof line).path).toEqual(
      end === 'remote-first'
        ? [
            [3, 1, 0],
            [5, 1, 0],
          ]
        : path,
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
      Object.assign(new Event('pointermove'), {
        button: 0,
        altKey: false,
        shiftKey: end === 'shift',
        ...location,
      }),
    )
  })
  expect((useScene.getState().nodes[follower.id] as typeof follower).path).not.toEqual(
    follower.path,
  )
  if (end === 'grid' || end === 'off' || end === 'shift') {
    const point = (useScene.getState().nodes[line.id] as typeof line).path[0]!
    expect(point[0]).toBeCloseTo(end === 'off' ? 0.7 : 0.5)
  }

  if (end === 'remote' || end === 'remote-up' || end === 'remote-move') {
    await act(async () => {
      applySceneOperationPatch({
        materialChanges: [],
        nodeCreates: [],
        nodeDeletes: [],
        nodeUpdates: [
          {
            id: line.id,
            data: {
              path: [
                [3, 1, 0],
                [5, 1, 0],
              ],
            },
            removeFields: [],
          },
        ],
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
  if (end === 'detach') {
    await act(async () => {
      window.dispatchEvent(
        Object.assign(new Event('pointermove'), { button: 0, altKey: true, ...location }),
      )
    })
    expect((useScene.getState().nodes[follower.id] as typeof follower).path).toEqual(follower.path)
  } else if (end === 'return') {
    await act(async () => {
      window.dispatchEvent(
        Object.assign(new Event('pointermove'), {
          button: 0,
          altKey: false,
          ...pointerAt([0, 1, 0]),
        }),
      )
    })
    expect((useScene.getState().nodes[follower.id] as typeof follower).path).toEqual(follower.path)
  } else if (end === 'cancel') {
    await act(async () => {
      window.dispatchEvent(Object.assign(new Event('pointercancel'), { button: 0, ...location }))
    })
  } else if (end === 'selection') {
    await act(async () => {
      useViewer.setState((state) => ({ selection: { ...state.selection, selectedIds: [] } }))
    })
  } else if (end === 'history') {
    await act(async () => {
      runUndo()
    })
  } else if (end === 'escape') {
    await act(async () => {
      emitter.emit('tool:cancel', undefined)
    })
  } else if (end === 'unmount') {
    await renderer.unmount()
  }
  await act(async () => {
    window.dispatchEvent(Object.assign(new Event('pointerup'), { button: 0, ...location }))
  })
  const finalPath = (useScene.getState().nodes[line.id] as typeof line).path
  const followerPath = (useScene.getState().nodes[follower.id] as typeof follower).path
  if (end === 'release' || end === 'grid' || end === 'off' || end === 'shift') {
    expect(finalPath).not.toEqual(path)
    expect(followerPath).not.toEqual(follower.path)
    expect(useScene.temporal.getState().pastStates).toHaveLength(1)
  } else if (end === 'detach') {
    expect(finalPath).not.toEqual(path)
    expect(followerPath).toEqual(follower.path)
    expect(useScene.temporal.getState().pastStates).toHaveLength(1)
  } else {
    expect(finalPath).toEqual(
      end === 'remote' || end === 'remote-up' || end === 'remote-move'
        ? [
            [3, 1, 0],
            [5, 1, 0],
          ]
        : path,
    )
    expect(followerPath).toEqual(follower.path)
    expect(useScene.temporal.getState().pastStates).toHaveLength(0)
  }
  expect(useScene.temporal.getState().isTracking).toBe(true)
  expect(useViewer.getState().inputDragging).toBe(false)
  expect(useInteractionScope.getState().scope.kind).toBe('idle')
})

test.each(['lineset', 'liquid'] as const)(
  '%s plan endpoint restores detached and stationary followers',
  (kind) => {
    const makeNode = (p: [number, number, number][]) =>
      kind === 'lineset'
        ? LinesetNode.parse({ ...linesetDefinition.defaults(), parentId: level.id, path: p })
        : LiquidLineNode.parse({ ...liquidLineDefinition.defaults(), parentId: level.id, path: p })
    const line = makeNode(path)
    const follower = makeNode([
      [-2, 1, 0],
      [0, 1, 0],
    ])
    const nodes = { [line.id]: line, [follower.id]: follower } as Record<AnyNodeId, AnyNode>
    useScene.setState({ nodes })
    const session = createPathPointMoveAffordance(
      kind === 'lineset' ? 'lineset' : 'liquid-line',
    ).start({
      node: line,
      nodes,
      payload: { pointIndex: 0 },
      initialPlanPoint: [0, 0],
      gridSnapStep: 0.5,
    })
    const modifiers = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false }
    session.apply({ planPoint: [0.5, 0], modifiers })
    expect((useScene.getState().nodes[follower.id] as typeof follower).path).not.toEqual(
      follower.path,
    )
    session.apply({ planPoint: [0.5, 0], modifiers: { ...modifiers, altKey: true } })
    expect((useScene.getState().nodes[follower.id] as typeof follower).path).toEqual(follower.path)
    session.apply({ planPoint: [0.5, 0], modifiers })
    session.apply({ planPoint: [0, 0], modifiers })
    expect((useScene.getState().nodes[follower.id] as typeof follower).path).toEqual(follower.path)
  },
)
