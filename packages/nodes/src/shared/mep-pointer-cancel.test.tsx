import { beforeEach, expect, test } from 'bun:test'
import {
  type AnyNode,
  type AnyNodeId,
  applySceneOperationPatch,
  BuildingNode,
  DuctSegmentNode,
  emitter,
  LevelNode,
  PipeSegmentNode,
  SiteNode,
  useLiveNodeOverrides,
  useScene,
} from '@aedifex/core'
import { runUndo, useEditor, useInteractionScope } from '@aedifex/editor'
import { useViewer } from '@aedifex/viewer'
import { useThree } from '@react-three/fiber'
import { act } from '@react-three/test-renderer'
import { useMemo } from 'react'
import { type Camera, Vector3 } from 'three'
import { installMountedScene, LevelScene, mount, settle } from '../__tests__/harness'
import { ductSegmentDefinition } from '../duct-segment/definition'
import DuctSelection from '../duct-segment/selection'
import { pipeSegmentDefinition } from '../pipe-segment/definition'
import PipeSelection from '../pipe-segment/selection'
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

function Scene({ kind, angled = false }: { kind: 'pipe' | 'duct'; angled?: boolean }) {
  const three = useThree()
  useMemo(() => {
    three.camera.position.set(angled ? 4 : 1, 6, 4)
    three.camera.lookAt(1, 1, 0)
    three.camera.updateMatrixWorld()
    three.gl.domElement.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 1000, height: 1000 }) as DOMRect
    camera = three.camera
  }, [three, angled])
  return (
    <>
      <LevelScene level={level} />
      {kind === 'pipe' ? <PipeSelection /> : <DuctSelection />}
    </>
  )
}

function pointerAt(point: [number, number, number]) {
  const p = new Vector3(...point).project(camera)
  return { clientX: ((p.x + 1) / 2) * 1000, clientY: ((1 - p.y) / 2) * 1000 }
}

test.each([
  ['pipe', 'run', 'pointer'],
  ['duct', 'run', 'pointer'],
  ['pipe', 'endpoint', 'pointer'],
  ['duct', 'endpoint', 'pointer'],
  ['pipe', 'run', 'selection'],
  ['duct', 'run', 'selection'],
  ['pipe', 'endpoint', 'selection'],
  ['duct', 'endpoint', 'selection'],
  ['pipe', 'run', 'history'],
  ['duct', 'endpoint', 'mode'],
  ['pipe', 'endpoint', 'escape'],
  ['duct', 'run', 'unmount'],
  ['pipe', 'run', 'release'],
  ['duct', 'run', 'release'],
  ['pipe', 'endpoint', 'release'],
  ['duct', 'endpoint', 'release'],
  ['pipe', 'run', 'alt'],
  ['duct', 'run', 'alt'],
  ['pipe', 'run', 'remote-first'],
  ['duct', 'run', 'remote-first'],
  ['pipe', 'endpoint', 'remote-first'],
  ['duct', 'endpoint', 'remote-first'],
  ['pipe', 'run', 'remote-after'],
  ['duct', 'run', 'remote-after'],
  ['pipe', 'endpoint', 'remote-after'],
  ['duct', 'endpoint', 'remote-after'],
] as const)('%s %s drag finishes correctly on %s', async (kind, handle, cancel) => {
  const node =
    kind === 'pipe'
      ? PipeSegmentNode.parse({ ...pipeSegmentDefinition.defaults(), parentId: level.id, path })
      : DuctSegmentNode.parse({ ...ductSegmentDefinition.defaults(), parentId: level.id, path })
  const nodes = [
    { ...site, children: [building.id] },
    { ...building, children: [level.id] },
    { ...level, children: [node.id] },
    node,
  ]
  useScene.setState({
    nodes: Object.fromEntries(nodes.map((n) => [n.id, n])),
    rootNodeIds: [site.id],
    dirtyNodes: new Set(nodes.map((n) => n.id)),
    readOnly: false,
  })
  useScene.temporal.getState().resume()
  useScene.temporal.getState().clear()
  useEditor.setState((state) => ({
    mode: 'select',
    tool: null,
    gridSnapStep: 0.5,
    snappingModeByContext: { ...state.snappingModeByContext, polygon: 'grid' },
  }))
  useViewer.setState({
    selection: {
      buildingId: building.id,
      levelId: level.id,
      zoneId: null,
      selectedIds: [node.id],
    },
  })
  const renderer = await mount(<Scene kind={kind} />)
  await settle(renderer)
  const hit = (predicate: (p: Vector3) => boolean) => {
    const matches = renderer.scene
      .findAll(
        (item) =>
          typeof item.props.onPointerDown === 'function' &&
          (item.instance as { isMesh?: boolean }).isMesh === true,
      )
      .filter((item) => predicate(item.instance.getWorldPosition(new Vector3())))
    expect(matches.length).toBeGreaterThan(0)
    expect(
      matches.every(
        (item) =>
          item.instance
            .getWorldPosition(new Vector3())
            .distanceTo(matches[0]!.instance.getWorldPosition(new Vector3())) < 1e-6,
      ),
    ).toBe(true)
    return matches[matches.length - 1]!
  }
  const near = (x: number, y: number) => Math.abs(x - y) < 1e-6
  const startX = handle === 'run' ? 1 : 0
  await renderer.fireEvent(
    hit((p) => near(p.x, startX) && near(p.y, 1) && near(p.z, 0)),
    'pointerDown',
    {
      nativeEvent: {
        button: 0,
        ...pointerAt([startX, 1, 0]),
        stopPropagation() {},
        stopImmediatePropagation() {},
      },
    },
  )
  await settle(renderer)
  const arrow = hit(
    (p) =>
      (handle === 'run' ? p.x > 1.05 && p.x < 1.95 : p.x < -0.05) && near(p.y, 1) && near(p.z, 0),
  )
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
    grip.x + (cancel === 'alt' ? 0.7 : handle === 'endpoint' ? 1 : 0.5),
    grip.y,
    grip.z,
  ])
  if (cancel === 'remote-first') {
    await act(async () => {
      applySceneOperationPatch({
        materialChanges: [],
        nodeCreates: [],
        nodeDeletes: [],
        nodeUpdates: [
          {
            id: node.id,
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
      window.dispatchEvent(Object.assign(new Event('pointermove'), { button: 0, ...location }))
      window.dispatchEvent(Object.assign(new Event('pointerup'), { button: 0, ...location }))
    })
    expect((useScene.getState().nodes[node.id] as typeof node).path).toEqual([
      [3, 1, 0],
      [5, 1, 0],
    ])
    expect(useScene.temporal.getState().pastStates).toHaveLength(0)
    expect(useViewer.getState().inputDragging).toBe(false)
    return
  }
  await act(async () => {
    window.dispatchEvent(
      Object.assign(new Event('pointermove'), { button: 0, altKey: cancel === 'alt', ...location }),
    )
  })
  expect(useLiveNodeOverrides.getState().overrides.has(node.id)).toBe(true)
  if (cancel === 'remote-after') {
    await act(async () => {
      const applied = applySceneOperationPatch({
        materialChanges: [],
        nodeCreates: [],
        nodeDeletes: [],
        nodeUpdates: [
          {
            id: node.id,
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
      expect(applied).toBe(false)
      useScene.setState((state) => ({
        nodes: {
          ...state.nodes,
          [node.id]: {
            ...state.nodes[node.id]!,
            path: [
              [3, 1, 0],
              [5, 1, 0],
            ],
          } as AnyNode,
        },
      }))
      expect((useScene.getState().nodes[node.id] as typeof node).path).toEqual([
        [3, 1, 0],
        [5, 1, 0],
      ])
      window.dispatchEvent(Object.assign(new Event('pointerup'), { button: 0, ...location }))
    })
    expect((useScene.getState().nodes[node.id] as typeof node).path).toEqual([
      [3, 1, 0],
      [5, 1, 0],
    ])
    expect(useLiveNodeOverrides.getState().overrides.has(node.id)).toBe(false)
    expect(useScene.temporal.getState().pastStates).toHaveLength(0)
    expect(useViewer.getState().inputDragging).toBe(false)
    return
  }
  if (cancel === 'alt') {
    const preview = useLiveNodeOverrides.getState().overrides.get(node.id) as {
      path: [number, number, number][]
    }
    expect(preview.path[0]![0]).toBeCloseTo(0.7)
  }
  await act(async () => {
    if (cancel === 'pointer') {
      window.dispatchEvent(Object.assign(new Event('pointercancel'), { button: 0, ...location }))
    } else if (cancel === 'selection') {
      useViewer.setState((state) => ({ selection: { ...state.selection, selectedIds: [] } }))
    } else if (cancel === 'history') {
      runUndo()
    } else if (cancel === 'mode') {
      useEditor.setState({ mode: 'build' })
    } else if (cancel === 'escape') {
      emitter.emit('tool:cancel', undefined)
    } else if (cancel === 'unmount') {
      await renderer.unmount()
    }
  })
  await act(async () => {
    window.dispatchEvent(Object.assign(new Event('pointerup'), { button: 0, ...location }))
  })
  if (cancel === 'release' || cancel === 'alt') {
    expect((useScene.getState().nodes[node.id] as typeof node).path).not.toEqual(path)
    expect(useScene.temporal.getState().pastStates).toHaveLength(1)
  } else {
    expect((useScene.getState().nodes[node.id] as typeof node).path).toEqual(path)
    expect(useScene.temporal.getState().pastStates).toHaveLength(0)
  }
  expect(useViewer.getState().inputDragging).toBe(false)
  expect(useInteractionScope.getState().scope.kind).toBe('idle')
  expect(useLiveNodeOverrides.getState().overrides.has(node.id)).toBe(false)
  expect(useScene.temporal.getState().isTracking).toBe(true)
})

test('duct roll does not commit on pointer cancellation', async () => {
  const node = DuctSegmentNode.parse({
    ...ductSegmentDefinition.defaults(),
    parentId: level.id,
    path,
  })
  const nodes = [
    { ...site, children: [building.id] },
    { ...building, children: [level.id] },
    { ...level, children: [node.id] },
    node,
  ]
  useScene.setState({
    nodes: Object.fromEntries(nodes.map((n) => [n.id, n])),
    rootNodeIds: [site.id],
    dirtyNodes: new Set(nodes.map((n) => n.id)),
    readOnly: false,
  })
  useScene.temporal.getState().resume()
  useScene.temporal.getState().clear()
  useEditor.setState({ mode: 'select', tool: null })
  useViewer.setState({
    selection: { buildingId: building.id, levelId: level.id, zoneId: null, selectedIds: [node.id] },
  })
  const renderer = await mount(<Scene kind="duct" angled />)
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
    return Math.abs(p.x - 1) < 1e-6 && Math.abs(p.y - 1) > 0.05 && Math.abs(p.z) > 0.05
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
  const location = pointerAt([1, 1.5, 0])
  await act(async () => {
    window.dispatchEvent(Object.assign(new Event('pointermove'), { button: 0, ...location }))
  })
  expect(useLiveNodeOverrides.getState().overrides.has(node.id)).toBe(true)
  await act(async () => {
    window.dispatchEvent(Object.assign(new Event('pointercancel'), { button: 0, ...location }))
  })
  await act(async () => {
    window.dispatchEvent(Object.assign(new Event('pointerup'), { button: 0, ...location }))
  })
  expect((useScene.getState().nodes[node.id] as typeof node).roll).toBe(node.roll)
  expect(useScene.temporal.getState().pastStates).toHaveLength(0)
  expect(useScene.temporal.getState().isTracking).toBe(true)
  expect(useViewer.getState().inputDragging).toBe(false)
  expect(useLiveNodeOverrides.getState().overrides.has(node.id)).toBe(false)
})

test.each(['pipe', 'duct'] as const)(
  '%s connected endpoint releases follower preview when Alt changes',
  async (kind) => {
    const makeNode = (runPath: [number, number, number][]) =>
      kind === 'pipe'
        ? PipeSegmentNode.parse({
            ...pipeSegmentDefinition.defaults(),
            parentId: level.id,
            path: runPath,
          })
        : DuctSegmentNode.parse({
            ...ductSegmentDefinition.defaults(),
            parentId: level.id,
            path: runPath,
          })
    const node = makeNode(path)
    const follower = makeNode([
      [-2, 1, 0],
      [0, 1, 0],
    ])
    const nodes = [
      { ...site, children: [building.id] },
      { ...building, children: [level.id] },
      { ...level, children: [node.id, follower.id] },
      node,
      follower,
    ]
    useScene.setState({
      nodes: Object.fromEntries(nodes.map((n) => [n.id, n])),
      rootNodeIds: [site.id],
      dirtyNodes: new Set(nodes.map((n) => n.id)),
      readOnly: false,
    })
    useScene.temporal.getState().resume()
    useScene.temporal.getState().clear()
    useEditor.setState({ mode: 'select', tool: null, gridSnapStep: 0.5 })
    useViewer.setState({
      selection: {
        buildingId: building.id,
        levelId: level.id,
        zoneId: null,
        selectedIds: [node.id],
      },
    })
    const renderer = await mount(<Scene kind={kind} />)
    await settle(renderer)
    const matches = (predicate: (p: Vector3) => boolean) =>
      renderer.scene
        .findAll(
          (item) =>
            typeof item.props.onPointerDown === 'function' &&
            (item.instance as { isMesh?: boolean }).isMesh === true,
        )
        .filter((item) => predicate(item.instance.getWorldPosition(new Vector3())))
    const near = (x: number, y: number) => Math.abs(x - y) < 1e-6
    const cube = matches((p) => near(p.x, 0) && near(p.y, 1) && near(p.z, 0)).at(-1)!
    await renderer.fireEvent(cube, 'pointerDown', {
      nativeEvent: {
        button: 0,
        ...pointerAt([0, 1, 0]),
        stopPropagation() {},
        stopImmediatePropagation() {},
      },
    })
    await settle(renderer)
    const arrow = matches((p) => p.x < -0.05 && p.x > -1 && near(p.y, 1) && near(p.z, 0)).at(-1)!
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
    const location = pointerAt([grip.x + 1, grip.y, grip.z])
    await act(async () => {
      window.dispatchEvent(
        Object.assign(new Event('pointermove'), { button: 0, altKey: false, ...location }),
      )
    })
    expect(useLiveNodeOverrides.getState().overrides.has(follower.id)).toBe(true)
    await act(async () => {
      window.dispatchEvent(
        Object.assign(new Event('pointermove'), { button: 0, altKey: true, ...location }),
      )
    })
    expect(useLiveNodeOverrides.getState().overrides.has(follower.id)).toBe(false)
    await act(async () => {
      window.dispatchEvent(
        Object.assign(new Event('pointermove'), { button: 0, altKey: false, ...location }),
      )
    })
    expect(useLiveNodeOverrides.getState().overrides.has(follower.id)).toBe(true)
    const original = pointerAt([0, 1, 0])
    await act(async () => {
      window.dispatchEvent(
        Object.assign(new Event('pointermove'), { button: 0, altKey: false, ...original }),
      )
    })
    expect(useLiveNodeOverrides.getState().overrides.has(follower.id)).toBe(false)
    await act(async () => {
      window.dispatchEvent(
        Object.assign(new Event('pointermove'), { button: 0, altKey: true, ...location }),
      )
    })
    await act(async () => {
      window.dispatchEvent(Object.assign(new Event('pointerup'), { button: 0, ...location }))
    })
    expect((useScene.getState().nodes[node.id] as typeof node).path).not.toEqual(path)
    expect((useScene.getState().nodes[follower.id] as typeof follower).path).toEqual(follower.path)
    expect(useScene.temporal.getState().pastStates).toHaveLength(1)
  },
)

test.each(['pipe', 'duct'] as const)(
  '%s plan drag restores a follower when it stops following',
  (kind) => {
    const makeNode = (runPath: [number, number, number][]) =>
      kind === 'pipe'
        ? PipeSegmentNode.parse({
            ...pipeSegmentDefinition.defaults(),
            parentId: level.id,
            path: runPath,
          })
        : DuctSegmentNode.parse({
            ...ductSegmentDefinition.defaults(),
            parentId: level.id,
            path: runPath,
          })
    const node = makeNode(path)
    const follower = makeNode([
      [-2, 1, 0],
      [0, 1, 0],
    ])
    const nodes = { [node.id]: node, [follower.id]: follower } as Record<AnyNodeId, AnyNode>
    useScene.setState({ nodes })
    const session = createPathPointMoveAffordance(
      kind === 'pipe' ? 'pipe-segment' : 'duct-segment',
    ).start({
      node,
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
    expect((useScene.getState().nodes[follower.id] as typeof follower).path).not.toEqual(
      follower.path,
    )
    session.apply({ planPoint: [0, 0], modifiers })
    expect((useScene.getState().nodes[follower.id] as typeof follower).path).toEqual(follower.path)
  },
)

test('plan follower restoration preserves a later external path change', () => {
  const node = PipeSegmentNode.parse({
    ...pipeSegmentDefinition.defaults(),
    parentId: level.id,
    path,
  })
  const follower = PipeSegmentNode.parse({
    ...pipeSegmentDefinition.defaults(),
    parentId: level.id,
    path: [
      [-2, 1, 0],
      [0, 1, 0],
    ],
  })
  const nodes = { [node.id]: node, [follower.id]: follower } as Record<AnyNodeId, AnyNode>
  useScene.setState({ nodes })
  const session = createPathPointMoveAffordance('pipe-segment').start({
    node,
    nodes,
    payload: { pointIndex: 0 },
    initialPlanPoint: [0, 0],
    gridSnapStep: 0.5,
  })
  const modifiers = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false }
  session.apply({ planPoint: [0.5, 0], modifiers })
  const externalPath: [number, number, number][] = [
    [-3, 1, 0],
    [0.25, 1, 0],
  ]
  applySceneOperationPatch({
    materialChanges: [],
    nodeCreates: [],
    nodeDeletes: [],
    nodeUpdates: [{ id: follower.id, data: { path: externalPath }, removeFields: [] }],
  })
  expect(session.canCommit()).toBe(false)
  session.apply({ planPoint: [0.5, 0], modifiers: { ...modifiers, altKey: true } })
  expect(session.canCommit()).toBe(false)
  expect((useScene.getState().nodes[follower.id] as typeof follower).path).toEqual(externalPath)
})
