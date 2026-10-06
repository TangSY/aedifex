import { expect, spyOn, test } from 'bun:test'
import {
  BuildingNode,
  clearSceneHistory,
  createSceneApi,
  emitter,
  type GridEvent,
  getSceneHistoryPauseDepth,
  LevelNode,
  useLiveNodeOverrides,
  useLiveTransforms,
  useScene,
  type WallEvent,
  WallNode,
  WindowNode,
} from '@aedifex/core'
import { useEditor } from '@aedifex/editor'
import { _roots, act, createRoot, extend } from '@react-three/fiber'
import { Group, LineSegments, PerspectiveCamera, type WebGLRenderer } from 'three'
import { RegistryToolProvider } from '../../../editor/src/components/tools/registry-tool-context'
import MoveWindowTool from './move-tool'

extend({ Group, LineSegments })

for (const ending of ['cancel', 'commit', 'direct-commit'] as const) {
  test(`window free-follow reparents once, previews without scene writes, and can ${ending}`, async () => {
    const previousScene = useScene.getState()
    const previousEditor = useEditor.getState()
    const previousOverrides = useLiveNodeOverrides.getState()
    const previousTransforms = useLiveTransforms.getState()
    const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    const previousAct = globals.IS_REACT_ACT_ENVIRONMENT
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
    const previousRaf = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame')
    const previousCancelRaf = Object.getOwnPropertyDescriptor(globalThis, 'cancelAnimationFrame')
    const events = new EventTarget()
    const pending = new Map<number, FrameRequestCallback>()
    let nextRaf = 0
    Object.defineProperty(globalThis, 'window', { configurable: true, value: events })
    Object.defineProperty(globalThis, 'requestAnimationFrame', {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        pending.set(++nextRaf, callback)
        return nextRaf
      },
    })
    Object.defineProperty(globalThis, 'cancelAnimationFrame', {
      configurable: true,
      value: (id: number) => pending.delete(id),
    })
    globals.IS_REACT_ACT_ENVIRONMENT = true
    let now = 0
    const clock = spyOn(performance, 'now').mockImplementation(() => now)
    const canvas = Object.assign(new EventTarget(), {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    }) as unknown as HTMLCanvasElement
    const root = createRoot(canvas)
    const windowNode = WindowNode.parse({
      id: 'window_free_follow',
      parentId: 'wall_free_follow_a',
      wallId: 'wall_free_follow_a',
      position: [1.5, 1.5, 0],
      side: 'front',
      width: 1,
      height: 1,
    })
    const wallA = WallNode.parse({
      id: 'wall_free_follow_a',
      parentId: 'level_free_follow',
      start: [0, 0],
      end: [8, 0],
      children: [windowNode.id],
    })
    const wallB = WallNode.parse({
      id: 'wall_free_follow_b',
      parentId: 'level_free_follow',
      start: [0, -5],
      end: [8, -5],
      children: [],
    })
    const level = LevelNode.parse({
      id: 'level_free_follow',
      parentId: 'building_free_follow',
      children: [wallA.id, wallB.id],
    })
    const building = BuildingNode.parse({ id: 'building_free_follow', children: [level.id] })
    const initialNodes = Object.fromEntries(
      [building, level, wallA, wallB, windowNode].map((node) => [node.id, node]),
    )
    const context = {
      activeLevelId: level.id,
      isCameraDragging: () => false,
      sceneApi: createSceneApi(useScene),
      selectNode: () => {},
    }
    const sendFloor = async (x: number) => {
      await act(async () =>
        emitter.emit('grid:move', {
          position: [x, 0, 4],
          localPosition: [x, 0, 4],
          nativeEvent: {} as GridEvent['nativeEvent'],
        }),
      )
    }
    try {
      useScene.setState({
        nodes: initialNodes,
        rootNodeIds: [building.id],
        dirtyNodes: new Set(),
        collections: {},
        materials: {},
        readOnly: false,
      })
      clearSceneHistory()
      useLiveNodeOverrides.getState().clearAll()
      useLiveTransforms.getState().clearAll()
      await root.configure({
        gl: {
          domElement: canvas,
          render() {},
          setSize() {},
          setPixelRatio() {},
        } as unknown as WebGLRenderer,
        camera: new PerspectiveCamera(),
        frameloop: 'never',
        dpr: 1,
        size: { width: 100, height: 100, top: 0, left: 0 },
      })
      await act(async () => {
        root.render(
          <RegistryToolProvider value={context}>
            <MoveWindowTool node={windowNode} />
          </RegistryToolProvider>,
        )
      })
      now = 100 // Let the initial wall-owned pointer lease expire.
      const beforeDetach = useScene.getState().nodes
      await sendFloor(2)
      const afterDetach = useScene.getState().nodes
      expect(afterDetach).not.toBe(beforeDetach)
      expect(afterDetach[windowNode.id]).toMatchObject({
        parentId: level.id,
        visible: false,
        position: [2, 1.5, 4],
      })
      expect((afterDetach[wallA.id] as WallNode).children).not.toContain(windowNode.id)
      expect((afterDetach[level.id] as LevelNode).children).toContain(windowNode.id)
      await sendFloor(3)
      await sendFloor(4)
      expect(useScene.getState().nodes).toBe(afterDetach)
      expect(useLiveNodeOverrides.getState().get(windowNode.id)).toMatchObject({
        position: [4, 1.5, 4],
        visible: false,
      })
      await act(async () => {
        events.dispatchEvent(Object.assign(new Event('keydown'), { key: 'r' }))
      })
      expect(useScene.getState().nodes).toBe(afterDetach)
      expect(useLiveNodeOverrides.getState().get(windowNode.id)).toMatchObject({
        rotation: [0, Math.PI, 0],
        side: 'back',
      })
      expect(useScene.temporal.getState().pastStates).toHaveLength(0)

      if (ending === 'cancel') {
        await act(async () => emitter.emit('tool:cancel'))
      } else {
        const wallEvent: WallEvent = {
          node: wallB,
          position: [3, 1.5, -5],
          localPosition: [3, 1.5, 0],
          normal: [0, 0, 1],
          object: new Group(),
          stopPropagation() {},
          nativeEvent: {} as WallEvent['nativeEvent'],
        }
        if (ending === 'commit') {
          await act(async () => emitter.emit('wall:move', wallEvent))
          expect(useLiveNodeOverrides.getState().get(windowNode.id)).toBeUndefined()
        }
        await act(async () => emitter.emit('wall:click', wallEvent))
        expect(useLiveNodeOverrides.getState().get(windowNode.id)).toBeUndefined()
        expect(useScene.getState().nodes[windowNode.id]).toMatchObject({
          parentId: wallB.id,
          wallId: wallB.id,
          position: [3, 1.5, 0],
          visible: true,
          side: 'back',
        })
      }
      await act(async () => {
        root.render(null)
      })
      expect(useLiveNodeOverrides.getState().get(windowNode.id)).toBeUndefined()
      expect(useLiveTransforms.getState().get(windowNode.id)).toBeUndefined()
      expect(getSceneHistoryPauseDepth()).toBe(0)
      expect(useScene.temporal.getState().pastStates).toHaveLength(ending === 'cancel' ? 0 : 1)
      if (ending !== 'cancel') useScene.temporal.getState().undo()
      expect(useScene.getState().nodes[windowNode.id]).toEqual(windowNode)
      expect((useScene.getState().nodes[wallA.id] as WallNode).children).toContain(windowNode.id)
      expect((useScene.getState().nodes[wallB.id] as WallNode).children).not.toContain(
        windowNode.id,
      )
    } finally {
      await act(async () => {
        root.render(null)
      })
      for (const [id, callback] of pending) {
        pending.delete(id)
        callback(now)
      }
      _roots.delete(canvas)
      clock.mockRestore()
      useScene.setState(previousScene)
      clearSceneHistory()
      useEditor.setState(previousEditor)
      useLiveNodeOverrides.setState(previousOverrides)
      useLiveTransforms.setState(previousTransforms)
      globals.IS_REACT_ACT_ENVIRONMENT = previousAct
      for (const [key, descriptor] of [
        ['window', previousWindow],
        ['requestAnimationFrame', previousRaf],
        ['cancelAnimationFrame', previousCancelRaf],
      ] as const) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else Reflect.deleteProperty(globalThis, key)
      }
    }
  })
}
