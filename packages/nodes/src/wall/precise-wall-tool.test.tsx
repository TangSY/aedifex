import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
import {
  BuildingNode,
  emitter,
  type GridEvent,
  LevelNode,
  useScene,
} from '@aedifex/core'
import {
  selectWallDrawVariant,
  useEditor,
  useFloorplanDraftPreview,
  usePrecisePlacement,
} from '@aedifex/editor'
import { useViewer } from '@aedifex/viewer'
import { Html } from '@react-three/drei'
import { act, create } from '@react-three/test-renderer'
import type { ReactNode } from 'react'
import WallTool from './tool'

const building = BuildingNode.parse({ id: 'building_precise' })
const level = LevelNode.parse({ id: 'level_precise', parentId: building.id })
const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
const savedCanvas = Object.getOwnPropertyDescriptor(globalThis, 'HTMLCanvasElement')
const savedCancelFrame = Object.getOwnPropertyDescriptor(globalThis, 'cancelAnimationFrame')
const savedRequestFrame = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame')
let scene: ReturnType<typeof useScene.getState>
let editor: ReturnType<typeof useEditor.getState>
let viewer: ReturnType<typeof useViewer.getState>
let html: ReturnType<typeof spyOn>
const grid = (x: number, z: number): GridEvent => ({
  position: [x, 0, z],
  localPosition: [x, 0, z],
  nativeEvent: { target: null, detail: 1 } as unknown as GridEvent['nativeEvent'],
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
  useScene.setState({
    nodes: { [building.id]: { ...building, children: [level.id] }, [level.id]: level },
    rootNodeIds: [building.id],
    dirtyNodes: new Set(),
    readOnly: false,
  })
  useViewer.getState().setSelection({ buildingId: building.id, levelId: level.id })
  useEditor.setState({
    mode: 'build',
    tool: 'wall',
    viewLayouts: {
      ...editor.viewLayouts,
      [editor.workspaceMode]: { split: false, panes: ['3d', '2d'], ratio: 0.5, focus: 0 },
    },
  })
  selectWallDrawVariant('walls')
  usePrecisePlacement.getState().clear()
})
afterEach(() => {
  html.mockRestore()
  useScene.setState(scene)
  useEditor.setState(editor)
  useViewer.setState(viewer)
  if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow)
  else Reflect.deleteProperty(globalThis, 'window')
  if (savedCanvas) Object.defineProperty(globalThis, 'HTMLCanvasElement', savedCanvas)
  else Reflect.deleteProperty(globalThis, 'HTMLCanvasElement')
  if (savedCancelFrame) Object.defineProperty(globalThis, 'cancelAnimationFrame', savedCancelFrame)
  else Reflect.deleteProperty(globalThis, 'cancelAnimationFrame')
  if (savedRequestFrame) Object.defineProperty(globalThis, 'requestAnimationFrame', savedRequestFrame)
  else Reflect.deleteProperty(globalThis, 'requestAnimationFrame')
})

test('3D wall commits typed length and heading without a pointer move', async () => {
  const renderer = await create(<WallTool />)
  try {
    await act(async () => emitter.emit('grid:click', grid(0, 0)))
    await act(async () => {
      for (const value of ['2', 'Tab', '9', '0', 'Enter']) key(value)
    })
    const walls = Object.values(useScene.getState().nodes).filter((node) => node.type === 'wall')
    expect(walls).toHaveLength(1)
    if (walls[0]?.type !== 'wall') throw new Error('wall missing')
    expect(walls[0].end[0]).toBeCloseTo(0, 5)
    expect(walls[0].end[1]).toBeCloseTo(2, 5)
    expect(usePrecisePlacement.getState().kind).toBeNull()
    expect(useFloorplanDraftPreview.getState().wallDraftStart).toBeNull()
  } finally {
    await renderer.unmount()
  }
})

test('a later keystroke is applied to a click without another pointer move', async () => {
  const renderer = await create(<WallTool />)
  try {
    await act(async () => emitter.emit('grid:click', grid(0, 0)))
    await act(async () => emitter.emit('grid:move', grid(1, 0)))
    await act(async () => {
      key('1')
      key('2')
    })
    await act(async () => emitter.emit('grid:click', grid(1, 0)))
    const wall = Object.values(useScene.getState().nodes).find((node) => node.type === 'wall')
    expect(wall?.type).toBe('wall')
    if (wall?.type === 'wall') expect(wall.end[0]).toBeCloseTo(12, 5)
  } finally {
    await renderer.unmount()
  }
})

test('escape clears only typed values and a later click uses the pointer again', async () => {
  const renderer = await create(<WallTool />)
  try {
    await act(async () => emitter.emit('grid:click', grid(0, 0)))
    await act(async () => emitter.emit('grid:move', grid(3, 0)))
    await act(async () => {
      key('1')
      key('Escape')
    })
    expect(usePrecisePlacement.getState().kind).toBeNull()
    expect(useFloorplanDraftPreview.getState().wallDraftStart).not.toBeNull()
    await act(async () => emitter.emit('grid:click', grid(3, 0)))
    const wall = Object.values(useScene.getState().nodes).find((node) => node.type === 'wall')
    expect(wall?.type).toBe('wall')
    if (wall?.type === 'wall') expect(wall.end[0]).toBeCloseTo(3, 5)
  } finally {
    await renderer.unmount()
  }
})

test('split-view pointer events and 3D preview use the same typed endpoint', async () => {
  useEditor.setState({
    viewLayouts: {
      ...editor.viewLayouts,
      [editor.workspaceMode]: { split: true, panes: ['2d', '3d'], ratio: 0.5, focus: 1 },
    },
  })
  const renderer = await create(<WallTool />)
  try {
    await act(async () => emitter.emit('grid:click', grid(0, 0)))
    await act(async () => {
      key('2')
    })
    const event = {
      ...grid(3, 4),
      screenProjection: { pointer: [10, 10], localToScreen: [1, 0, 0, 1, 0, 0] },
    }
    await act(async () => emitter.emit('grid:move', event))
    const preview = useFloorplanDraftPreview.getState().wallDraftEnd
    expect(preview?.[0]).toBeCloseTo(1.2, 5)
    expect(preview?.[1]).toBeCloseTo(1.6, 5)
    await act(async () => key('Enter'))
    const wall = Object.values(useScene.getState().nodes).find((node) => node.type === 'wall')
    expect(wall?.type).toBe('wall')
    if (wall?.type === 'wall') {
      expect(wall.end[0]).toBeCloseTo(1.2, 5)
      expect(wall.end[1]).toBeCloseTo(1.6, 5)
    }
  } finally {
    await renderer.unmount()
  }
})
