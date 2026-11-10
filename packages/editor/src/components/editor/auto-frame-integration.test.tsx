import { expect, test } from 'bun:test'
import { emitter, useScene, WallNode } from '@aedifex/core'
import { useViewer } from '@aedifex/viewer'
import { act, create } from '@react-three/test-renderer'
import { useFrame } from '@react-three/fiber'
import { OrthographicCamera, Vector3 } from 'three'
import { requestAutoFrame, useAutoFrame } from '../../hooks/use-auto-frame'
import useEditor from '../../store/use-editor'
import useFollowAedifex from '../../store/use-follow-pascal'
import { CustomCameraControls } from './custom-camera-controls'
import { FollowAedifex } from './follow-pascal'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
globalThis.requestAnimationFrame ??= () => 0
globalThis.cancelAnimationFrame ??= () => {}

test('automatic frame moves the mounted orbit controls without pausing follow', async () => {
  const prior = {
    scene: useScene.getState(),
    viewer: useViewer.getState(),
    editor: useEditor.getState(),
    follow: useFollowAedifex.getState(),
  }
  const scope = globalThis as Record<string, unknown>
  const oldWindow = scope.window
  const oldDocument = scope.document
  const oldRect = scope.DOMRect
  const oldRaf = scope.requestAnimationFrame
  const oldCancelRaf = scope.cancelAnimationFrame
  let nextFrame = 0
  const frames = new Map<number, FrameRequestCallback>()
  scope.requestAnimationFrame = (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback)
    return nextFrame
  }
  scope.cancelAnimationFrame = (id: number) => {
    frames.delete(id)
  }
  const noop = () => {}
  scope.DOMRect ??= class {
    x = 0
    y = 0
    width = 800
    height = 600
  }
  scope.document ??= { addEventListener: noop, removeEventListener: noop, body: { style: {} } }
  scope.window ??= { addEventListener: noop, removeEventListener: noop }
  let controls: { getTarget: (target: Vector3, receiveEndValue?: boolean) => Vector3 } | null = null
  let setCamera: ((camera: OrthographicCamera) => void) | null = null
  function Probe() {
    useFrame((state) => {
      controls = state.controls as typeof controls
      setCamera = (camera) => state.set({ camera })
    })
    return null
  }
  function AutoFrameHost() {
    useAutoFrame()
    return null
  }
  const wall = WallNode.parse({ id: 'wall_frame', start: [100, 100], end: [110, 100] })
  useScene.setState({ nodes: { [wall.id]: wall }, rootNodeIds: [wall.id] })
  useViewer.setState({ cameraMode: 'perspective', renderPaused: false })
  useEditor.setState({
    isPreviewMode: false,
    isFirstPersonMode: false,
    captureMode: { mode: 'idle' },
  })
  useFollowAedifex.setState({ on: true, paused: false, building: false })
  let renderer: Awaited<ReturnType<typeof create>> | null = null
  try {
    renderer = await create(
      <>
        <CustomCameraControls />
        <FollowAedifex />
        <Probe />
        <AutoFrameHost />
      </>,
      {
        beforeReturn: (canvas) => {
          Object.assign(canvas, {
            setAttribute: noop,
            removeAttribute: noop,
            getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 800 }),
            ownerDocument: scope.document,
          })
        },
      },
    )
    await act(async () => {
      requestAutoFrame({ [wall.id]: wall })
      for (let i = 0; i < 180; i++) await renderer!.advanceFrames(1, 1 / 60)
    })
    expect(controls).not.toBeNull()
    const target = (controls as NonNullable<typeof controls>).getTarget(new Vector3())
    expect(target.x).toBeCloseTo(105, 0)
    expect(target.z).toBeCloseTo(100, 0)
    expect(useFollowAedifex.getState().paused).toBe(false)
    const other = WallNode.parse({ id: 'wall_other', start: [300, 300], end: [310, 300] })
    await act(async () => {
      useFollowAedifex.setState({ building: true })
      requestAutoFrame({ [other.id]: other })
      await renderer!.advanceFrames(10, 1 / 60)
    })
    expect((controls as NonNullable<typeof controls>).getTarget(new Vector3()).x).toBeCloseTo(
      105,
      0,
    )
    await act(async () => {
      useFollowAedifex.setState({ building: false })
      requestAutoFrame({ [other.id]: other })
      emitter.emit('camera-controls:fit-scene', {
        bounds: { min: [100, 100], max: [110, 100], center: [105, 100], size: [10, 0] },
      })
      await renderer!.advanceFrames(10, 1 / 60)
    })
    expect((controls as NonNullable<typeof controls>).getTarget(new Vector3()).x).toBeCloseTo(
      105,
      0,
    )
    expect(useFollowAedifex.getState().paused).toBe(true)

    await act(async () => {
      useEditor.setState({ isFirstPersonMode: true })
    })
    await act(async () => {
      requestAutoFrame({ [other.id]: other })
      await renderer!.advanceFrames(2, 1 / 60)
    })
    await act(async () => {
      useEditor.setState({ isFirstPersonMode: false })
    })
    await act(async () => {
      const scheduled = [...frames.values()]
      frames.clear()
      for (const callback of scheduled) callback(performance.now())
      for (let i = 0; i < 180; i++) await renderer!.advanceFrames(1, 1 / 60)
    })
    expect((controls as NonNullable<typeof controls>).getTarget(new Vector3()).x).toBeCloseTo(
      305,
      0,
    )

    await act(async () => {
      useScene.setState({ nodes: {}, rootNodeIds: [] })
      useScene.setState({ nodes: { [wall.id]: wall }, rootNodeIds: [wall.id] })
      for (let i = 0; i < 180; i++) await renderer!.advanceFrames(1, 1 / 60)
    })
    expect((controls as NonNullable<typeof controls>).getTarget(new Vector3()).x).toBeCloseTo(
      105,
      0,
    )

    const orthographic = new OrthographicCamera(-8, 8, 5, -5, 0.1, 1000)
    orthographic.zoom = 10
    orthographic.updateProjectionMatrix()
    await act(async () => {
      useViewer.setState({ cameraMode: 'orthographic' })
      setCamera!(orthographic)
    })
    await act(async () => {
      requestAutoFrame({ [wall.id]: wall })
      for (let i = 0; i < 180; i++) await renderer!.advanceFrames(1, 1 / 60)
    })
    orthographic.updateMatrixWorld(true)
    expect(orthographic.zoom).toBeLessThan(10)
    for (const point of [
      [100, 100],
      [110, 100],
    ]) {
      const projected = new Vector3(point[0], 0, point[1]).project(orthographic)
      expect(Math.abs(projected.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(projected.y)).toBeLessThanOrEqual(1)
    }
    await act(async () => {
      useEditor.setState({ isCaptureMode: true, captureMode: { mode: 'preset', isolated: [] } })
      requestAutoFrame({ [other.id]: other })
      for (let i = 0; i < 10; i++) await renderer!.advanceFrames(1, 1 / 60)
    })
    expect((controls as NonNullable<typeof controls>).getTarget(new Vector3()).x).toBeCloseTo(
      105,
      0,
    )
    await act(async () => {
      useEditor.setState({ isCaptureMode: false, captureMode: { mode: 'idle' } })
      for (let i = 0; i < 180; i++) await renderer!.advanceFrames(1, 1 / 60)
    })
    expect((controls as NonNullable<typeof controls>).getTarget(new Vector3()).x).toBeCloseTo(
      305,
      0,
    )
  } finally {
    await renderer?.unmount()
    useScene.setState(prior.scene)
    useViewer.setState(prior.viewer)
    useEditor.setState(prior.editor)
    useFollowAedifex.setState(prior.follow)
    scope.window = oldWindow
    scope.document = oldDocument
    scope.DOMRect = oldRect
    scope.requestAnimationFrame = oldRaf
    scope.cancelAnimationFrame = oldCancelRaf
  }
})
