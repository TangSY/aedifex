import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
import {
  BuildingNode,
  emitter,
  type GridEvent,
  LevelNode,
  nodeRegistry,
  registerNode,
  spatialGridManager,
  useScene,
  WallNode,
} from '@aedifex/core'
import { useEditor, usePlacementPreview, usePrecisePlacement } from '@aedifex/editor'
import { useViewer } from '@aedifex/viewer'
import { Html } from '@react-three/drei'
import { act, create } from '@react-three/test-renderer'
import type { ReactNode } from 'react'
import { cabinetDefinition, cabinetModuleDefinition } from './definition'
import CabinetTool from './tool'

const building = BuildingNode.parse({ id: 'building_cabinet_precise' })
const level = LevelNode.parse({ id: 'level_cabinet_precise', parentId: building.id })
const wall = WallNode.parse({
  id: 'wall_cabinet_precise',
  parentId: level.id,
  start: [0, 0],
  end: [4, 0],
  thickness: 0.2,
})
const saved = new Map(
  ['window', 'HTMLCanvasElement', 'requestAnimationFrame', 'cancelAnimationFrame'].map((name) => [
    name,
    Object.getOwnPropertyDescriptor(globalThis, name),
  ]),
)
let scene: ReturnType<typeof useScene.getState>
let editor: ReturnType<typeof useEditor.getState>
let viewer: ReturnType<typeof useViewer.getState>
let html: ReturnType<typeof spyOn>
let restoreRegistry: () => void
const grid = (x: number, z = 0.12): GridEvent => ({
  position: [x, 0, z],
  localPosition: [x, 0, z],
  nativeEvent: { detail: 1, timeStamp: performance.now() } as unknown as GridEvent['nativeEvent'],
})
const key = (name: string) =>
  window.dispatchEvent(
    Object.assign(new Event('keydown', { cancelable: true }), {
      key: name,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      isComposing: false,
    }),
  )
const cabinets = () =>
  Object.values(useScene.getState().nodes).filter((node) => node.type === 'cabinet')

beforeEach(() => {
  globalThis.window = Object.assign(new EventTarget(), {
    cancelAnimationFrame: () => {},
    requestAnimationFrame: () => 0,
  }) as unknown as Window & typeof globalThis
  globalThis.HTMLCanvasElement = class {} as typeof HTMLCanvasElement
  globalThis.cancelAnimationFrame = () => {}
  globalThis.requestAnimationFrame = () => 0
  html = spyOn(Html as unknown as { render: () => ReactNode }, 'render').mockImplementation(
    () => null,
  )
  scene = useScene.getState()
  editor = useEditor.getState()
  viewer = useViewer.getState()
  restoreRegistry = nodeRegistry._snapshot()
  if (!nodeRegistry.get('cabinet')) registerNode(cabinetDefinition)
  if (!nodeRegistry.get('cabinet-module')) registerNode(cabinetModuleDefinition)
  useScene.setState({
    nodes: {
      [building.id]: { ...building, children: [level.id] },
      [level.id]: { ...level, children: [wall.id] },
      [wall.id]: wall,
    },
    rootNodeIds: [building.id],
    dirtyNodes: new Set(),
    readOnly: false,
  })
  useViewer.getState().setSelection({ buildingId: building.id, levelId: level.id })
  useEditor.setState({ mode: 'build', tool: 'cabinet' })
  useEditor.getState().setContinuation('cabinet', 'single')
  usePrecisePlacement.getState().clear()
  usePlacementPreview.getState().clear()
  spatialGridManager.clear()
})
afterEach(() => {
  html.mockRestore()
  restoreRegistry()
  useScene.setState(scene)
  useEditor.setState(editor)
  useViewer.setState(viewer)
  usePrecisePlacement.getState().clear()
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  }
})

test('wall cabinet preview accepts distance and offset and commits on Enter', async () => {
  const renderer = await create(<CabinetTool />)
  try {
    await act(async () => emitter.emit('grid:move', grid(1)))
    await act(async () => {
      for (const value of ['1', 'Tab', '0', '.', '2']) key(value)
    })
    expect(usePrecisePlacement.getState().kind).toBe('cabinet')
    expect(usePlacementPreview.getState().node?.position[0]).toBeCloseTo(1.25)
    expect(usePlacementPreview.getState().node?.position[2]).toBeCloseTo(0.6)
    await act(async () => key('Enter'))
    expect(cabinets()).toHaveLength(1)
    expect(cabinets()[0]?.position[0]).toBeCloseTo(1.25)
    expect(usePrecisePlacement.getState().kind).toBeNull()
  } finally {
    await renderer.unmount()
  }
})

test('invalid distance cannot commit and escape restores pointer placement', async () => {
  const renderer = await create(<CabinetTool />)
  try {
    await act(async () => emitter.emit('grid:move', grid(1)))
    await act(async () => key('9'))
    expect(usePrecisePlacement.getState().position).not.toBeNull()
    await act(async () => key('Enter'))
    expect(cabinets()).toHaveLength(0)
    expect(usePrecisePlacement.getState().kind).toBe('cabinet')
    await act(async () => emitter.emit('grid:move', grid(2)))
    await act(async () => key('Escape'))
    expect(usePrecisePlacement.getState().kind).toBeNull()
    expect(usePlacementPreview.getState().node?.position[0]).toBeCloseTo(2)
    await act(async () => emitter.emit('grid:click', grid(2)))
    expect(cabinets()).toHaveLength(1)
    expect(cabinets()[0]?.position[0]).toBeCloseTo(2)
  } finally {
    await renderer.unmount()
  }
})

test('continuous placement starts its stretch at the typed position', async () => {
  useEditor.getState().setContinuation('cabinet', 'continuous')
  const renderer = await create(<CabinetTool />)
  try {
    await act(async () => emitter.emit('grid:move', grid(1)))
    await act(async () => {
      key('2')
      key('Enter')
    })
    expect(usePrecisePlacement.getState().kind).toBeNull()
    expect(cabinets()).toHaveLength(0)
    expect(usePlacementPreview.getState().node?.position[0]).toBeCloseTo(2.25)
  } finally {
    await renderer.unmount()
  }
})

test('typed placement cannot bypass a new collision with Alt click', async () => {
  const renderer = await create(<CabinetTool />)
  let collision: ReturnType<typeof spyOn> | undefined
  try {
    await act(async () => emitter.emit('grid:move', grid(1)))
    await act(async () => key('2'))
    collision = spyOn(spatialGridManager, 'canPlaceOnFloorFootprints').mockReturnValue({
      valid: false,
      conflictIds: ['cabinet_blocker'],
    })
    await act(async () =>
      emitter.emit('grid:click', {
        ...grid(2),
        nativeEvent: { altKey: true, detail: 1 } as unknown as GridEvent['nativeEvent'],
      }),
    )
    expect(cabinets()).toHaveLength(0)
    expect(usePrecisePlacement.getState().kind).toBe('cabinet')
  } finally {
    collision?.mockRestore()
    await renderer.unmount()
  }
})

test('Tab still selects cabinet dimensions before numeric entry', async () => {
  const renderer = await create(<CabinetTool />)
  try {
    await act(async () => emitter.emit('grid:move', grid(1)))
    await act(async () => key('Tab'))
    expect(usePrecisePlacement.getState().kind).toBeNull()
    expect(usePlacementPreview.getState().activeDimensionId).not.toBeNull()
  } finally {
    await renderer.unmount()
  }
})

test('click commits the latest typed distance without requiring pointer movement', async () => {
  const renderer = await create(<CabinetTool />)
  try {
    await act(async () => emitter.emit('grid:move', grid(1)))
    await act(async () => {
      key('1')
      key('.')
      key('5')
    })
    await act(async () => emitter.emit('grid:click', grid(1)))
    expect(cabinets()).toHaveLength(1)
    expect(cabinets()[0]?.position[0]).toBeCloseTo(1.75)
  } finally {
    await renderer.unmount()
  }
})
