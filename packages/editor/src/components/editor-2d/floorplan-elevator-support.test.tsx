import { expect, test } from 'bun:test'
import type { AnyNode, AnyNodeDefinition, AnyNodeId } from '@aedifex/core'
import * as core from '@aedifex/core'
import { useViewer } from '@aedifex/viewer'
import { createRoot, extend } from '@react-three/fiber'
import { act, createElement } from 'react'
import * as three from 'three'
import useAlignmentGuides from '../../store/use-alignment-guides'
import useEditor from '../../store/use-editor'
import useFacingPose from '../../store/use-facing-pose'
import useInteractionScope from '../../store/use-interaction-scope'
import usePlacementPreview from '../../store/use-placement-preview'
import { MoveRegistryNodeTool } from '../tools/registry/move-registry-node-tool'
import { FloorplanRegistryMoveOverlay } from './floorplan-registry-move-overlay'

test('moving an elevator from a raised slab to ground in the plan commits ground elevation', async () => {
  const globals = [
    'window',
    'document',
    'DOMRect',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'IS_REACT_ACT_ENVIRONMENT',
  ] as const
  const descriptors = globals.map((key) => Object.getOwnPropertyDescriptor(globalThis, key))
  const stores = [
    core.useScene,
    core.useScene.temporal,
    useViewer,
    useEditor,
    useInteractionScope,
    core.useLiveTransforms,
    core.useLiveNodeOverrides,
    useAlignmentGuides,
    useFacingPose,
    usePlacementPreview,
  ]
  const snapshots = stores.map((store) => store.getState())
  const restoreRegistry = core.nodeRegistry._snapshot()
  const building = core.BuildingNode.parse({
    id: 'building_elevator_plan',
    children: ['level_elevator_plan'],
  })
  const level = core.LevelNode.parse({ id: 'level_elevator_plan', parentId: building.id, level: 0 })
  const slab = core.SlabNode.parse({
    id: 'slab_elevator_plan',
    parentId: level.id,
    polygon: [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ],
    elevation: 0.8,
    thickness: 0.8,
  })
  const elevator = core.ElevatorNode.parse({
    id: 'elevator_plan_test',
    parentId: building.id,
    fromLevelId: level.id,
    position: [2, 0.8, 2],
  })
  const rectangle = class {
    constructor(
      public x = 0,
      public y = 0,
      public width = 0,
      public height = 0,
    ) {}
  }
  const entry = {
    style: { visibility: '' },
    getAttribute: (name: string) => (name === 'data-node-id' ? elevator.id : null),
    getBBox: () => new rectangle(1.5, 1.5, 1, 1),
    setAttribute: () => {},
    removeAttribute: () => {},
  }
  const svg = {
    getBoundingClientRect: () => ({ left: -100, top: -100, right: 100, bottom: 100 }),
    createSVGPoint: () => ({
      x: 0,
      y: 0,
      matrixTransform() {
        return { x: this.x, y: this.y }
      },
    }),
  }
  const scene = {
    ownerSVGElement: svg,
    getScreenCTM: () => ({ inverse: () => ({}) }),
    querySelector: () => entry,
    querySelectorAll: () => [entry],
    appendChild: () => {},
  }
  const windowFixture = Object.assign(new EventTarget(), {
    matchMedia: () => Object.assign(new EventTarget(), { matches: false }),
  })
  let root: ReturnType<typeof createRoot> | undefined
  const previousObject = core.sceneRegistry.nodes.get(elevator.id)
  const object = new three.Object3D()
  try {
    Object.defineProperties(globalThis, {
      window: { configurable: true, value: windowFixture },
      document: {
        configurable: true,
        value: {
          querySelector: () => scene,
          createElementNS: () => ({ setAttribute: () => {}, remove: () => {} }),
        },
      },
      DOMRect: { configurable: true, value: rectangle },
      requestAnimationFrame: {
        configurable: true,
        value: (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0),
      },
      cancelAnimationFrame: { configurable: true, value: (id: number) => clearTimeout(id) },
      IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
    })
    core.registerNode({
      kind: 'elevator',
      schemaVersion: 1,
      schema: core.ElevatorNode,
      category: 'structure',
      defaults: () => ({}),
      floorplan: () => [],
      capabilities: {
        movable: {
          axes: ['x', 'z'],
          gridSnap: true,
        },
      },
    } as unknown as AnyNodeDefinition)
    core.useScene.setState({
      nodes: {
        [building.id]: building,
        [level.id]: level,
        [slab.id]: slab,
        [elevator.id]: elevator,
      } as Record<AnyNodeId, AnyNode>,
      rootNodeIds: [building.id],
    })
    core.spatialGridManager.handleNodeCreated(slab, level.id)
    core.clearSceneHistory()
    useViewer.getState().setSelection({ buildingId: building.id, levelId: level.id })
    useEditor.getState().setMovingNode(elevator)
    const gl = {
      render: () => {
        throw Error('unexpected render')
      },
      setSize: () => {},
      setPixelRatio: () => {},
      domElement: {},
    }
    root = createRoot({} as HTMLCanvasElement)
    await root.configure({
      gl: gl as never,
      frameloop: 'never',
      size: { width: 200, height: 200, top: 0, left: 0 },
    })
    await act(async () => {
      root!.render(createElement(FloorplanRegistryMoveOverlay))
    })
    const fire = async (type: string, x: number, z: number) => {
      const event = new Event(type, { cancelable: true })
      Object.defineProperties(event, {
        clientX: { value: x },
        clientY: { value: z },
        button: { value: 0 },
        altKey: { value: false },
        target: { value: { closest: () => null } },
      })
      await act(async () => {
        windowFixture.dispatchEvent(event)
      })
    }
    await fire('pointermove', 2, 2)
    await fire('pointermove', 8, 8)
    await fire('pointerup', 8, 8)
    expect((core.useScene.getState().nodes[elevator.id] as typeof elevator).position).toEqual([
      8, 0, 8,
    ])
    await act(async () => core.useScene.temporal.getState().undo())
    expect((core.useScene.getState().nodes[elevator.id] as typeof elevator).position).toEqual([
      2, 0.8, 2,
    ])

    // Drive the mounted 3D controller through its grid events as well.
    extend(three)
    core.sceneRegistry.nodes.set(elevator.id, object)
    await act(async () => {
      useViewer.getState().setSelection({ buildingId: building.id, levelId: null })
      useEditor.getState().setMovingNode(elevator)
      root!.render(createElement(MoveRegistryNodeTool, { node: elevator }))
    })
    const move3d = async (x: number, z: number) => {
      await act(async () => {
        core.emitter.emit('grid:move', {
          position: [x, 0, z],
          localPosition: [x, 0, z],
          nativeEvent: {},
        } as never)
      })
    }
    await move3d(2, 2)
    await move3d(8, 8)
    expect(core.useLiveTransforms.getState().transforms.get(elevator.id)?.position).toEqual([
      8, 0, 8,
    ])
    await act(async () => {
      core.emitter.emit('grid:click', { stopPropagation: () => {} } as never)
    })
    expect((core.useScene.getState().nodes[elevator.id] as typeof elevator).position).toEqual([
      8, 0, 8,
    ])
    await act(async () => {
      root!.render(null)
      core.useScene.temporal.getState().undo()
    })
    expect((core.useScene.getState().nodes[elevator.id] as typeof elevator).position).toEqual([
      2, 0.8, 2,
    ])
    useEditor.getState().setMovingNode(elevator)
    await act(async () => {
      root!.render(createElement(MoveRegistryNodeTool, { node: elevator }))
    })
    await move3d(2, 2)
    await move3d(8, 8)
    await act(async () => {
      core.emitter.emit('tool:cancel')
    })
    expect((core.useScene.getState().nodes[elevator.id] as typeof elevator).position).toEqual([
      2, 0.8, 2,
    ])
    expect(core.useLiveTransforms.getState().transforms.has(elevator.id)).toBe(false)
    await act(async () => {
      root!.render(null)
      useViewer.getState().setSelection({ buildingId: building.id, levelId: level.id })
      useEditor.getState().setMovingNode(elevator)
      root!.render(createElement(FloorplanRegistryMoveOverlay))
    })
    await fire('pointermove', 2, 2)
    await fire('pointermove', 8, 8)
    await act(async () => {
      const event = new Event('keydown', { cancelable: true })
      Object.defineProperty(event, 'key', { value: 'Escape' })
      windowFixture.dispatchEvent(event)
    })
    expect((core.useScene.getState().nodes[elevator.id] as typeof elevator).position).toEqual([
      2, 0.8, 2,
    ])
  } finally {
    if (root)
      await act(async () => {
        root!.unmount()
      })
    restoreRegistry()
    if (previousObject) core.sceneRegistry.nodes.set(elevator.id, previousObject)
    else core.sceneRegistry.nodes.delete(elevator.id)
    core.spatialGridManager.handleNodeDeleted(slab, level.id)
    stores.forEach((store, index) => {
      ;(store.setState as (snapshot: unknown, replace: true) => void)(snapshots[index], true)
    })
    globals.forEach((key, index) => {
      const descriptor = descriptors[index]
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    })
  }
}, 15_000)
