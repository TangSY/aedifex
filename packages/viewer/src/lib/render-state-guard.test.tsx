import { expect, jest, spyOn, test } from 'bun:test'
import { act, create } from '@react-three/test-renderer'
import {
  ACESFilmicToneMapping,
  Color,
  Layers,
  NoToneMapping,
  PerspectiveCamera,
  Scene,
} from 'three'
import { context, mrt, output } from 'three/tsl'
import {
  NodeFrame,
  PassNode,
  PMREMGenerator,
  RenderPipeline,
  RenderTarget,
  WebGPURenderer,
} from 'three/webgpu'
import { DaylightAtmosphere } from '../components/viewer/daylight-atmosphere'
import PostProcessing from '../components/viewer/post-processing'
import {
  type SceneAtmosphereSource,
  useSceneAtmosphere,
} from '../components/viewer/scene-atmosphere'
import { isDaylightAtmosphere } from './daylight/look'
import { OVERLAY_LAYER, SCENE_LAYER } from './layers'
import { createRenderStateGuard } from './render-state-guard'

function makeRenderer() {
  const canvas = { width: 320, height: 240, style: {} } as HTMLCanvasElement
  const renderer = new WebGPURenderer({ canvas, forceWebGL: true })
  renderer.setScissorTest = () => {}
  return renderer
}

function mockNavigator(value: object) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value })
  return () => {
    if (original) Object.defineProperty(globalThis, 'navigator', original)
    else Reflect.deleteProperty(globalThis, 'navigator')
  }
}

test('a failed Three scene pass restores the base context before a fallback draw', () => {
  const renderer = makeRenderer()
  const scene = new Scene()
  const camera = new PerspectiveCamera()
  camera.layers.enable(OVERLAY_LAYER)
  const cameraMask = camera.layers.mask
  const baseContext = renderer.contextNode
  const baseMrt = mrt({ output })
  const target = new RenderTarget(32, 32)
  renderer.setRenderTarget(target, 2, 1)
  renderer.setMRT(baseMrt)
  renderer.autoClear = false
  renderer.xr.enabled = true
  renderer.toneMapping = ACESFilmicToneMapping
  scene.name = 'viewer'

  const scenePass = new PassNode(PassNode.COLOR, scene, camera)
  scenePass.name = 'daylight'
  scenePass.contextNode = context({ getGI: () => null })
  const passLayers = new Layers()
  passLayers.set(SCENE_LAYER)
  scenePass.setLayers(passLayers)
  const frame = new NodeFrame()
  frame.renderer = renderer
  renderer.render = () => {
    expect(renderer.contextNode).not.toBe(baseContext)
    expect(camera.layers.mask).toBe(passLayers.mask)
    expect(scene.name).toBe('daylight')
    throw new Error('scene shader failed')
  }
  const draw = createRenderStateGuard({ renderer, scene, camera })

  expect(() =>
    draw(() => {
      renderer.xr.enabled = false
      renderer.toneMapping = NoToneMapping
      scenePass.updateBefore(frame)
    }),
  ).toThrow('scene shader failed')

  expect(renderer.contextNode).toBe(baseContext)
  expect(renderer.getMRT()).toBe(baseMrt)
  expect(renderer.getRenderTarget()).toBe(target)
  expect(renderer.getActiveCubeFace()).toBe(2)
  expect(renderer.getActiveMipmapLevel()).toBe(1)
  expect(renderer.autoClear).toBe(false)
  expect(renderer.xr.enabled).toBe(true)
  expect(renderer.toneMapping).toBe(ACESFilmicToneMapping)
  expect(camera.layers.mask).toBe(cameraMask)
  expect(scene.name).toBe('viewer')
  scenePass.dispose()
  target.dispose()
})

test('a failed Three PMREM cube capture restores the viewer target and clear state', () => {
  const renderer = makeRenderer()
  const scene = new Scene()
  const target = new RenderTarget(32, 32)
  renderer.setRenderTarget(target, 3, 2)
  renderer.setClearColor(new Color('blue'), 0.25)
  renderer.autoClear = false
  renderer.autoClearDepth = false
  renderer.xr.enabled = true
  renderer.hasInitialized = () => true
  renderer.render = () => {
    expect(renderer.getRenderTarget()).not.toBe(target)
    expect(renderer.xr.enabled).toBe(false)
    expect(renderer.autoClearDepth).toBe(true)
    throw new Error('cube shader failed')
  }
  const generator = new PMREMGenerator(renderer)
  const capture = createRenderStateGuard({ renderer, scene })

  expect(() => capture(() => generator.fromScene(scene))).toThrow('cube shader failed')

  expect(renderer.getRenderTarget()).toBe(target)
  expect(renderer.getActiveCubeFace()).toBe(3)
  expect(renderer.getActiveMipmapLevel()).toBe(2)
  expect(renderer.autoClear).toBe(false)
  expect(renderer.autoClearDepth).toBe(false)
  expect(renderer.getClearAlpha()).toBe(0.25)
  expect(renderer.xr.enabled).toBe(true)
  expect(scene.background).toBeNull()
  generator.dispose()
  target.dispose()
})

test('daylight keeps real lamps available until a room context draw succeeds', async () => {
  const renderer = makeRenderer()
  const baseContext = renderer.contextNode
  const usedRoomContext: boolean[] = []
  let failRoomDraw = false
  renderer.render = () => {
    const inRooms = renderer.contextNode !== baseContext
    usedRoomContext.push(inRooms)
    if (inRooms && failRoomDraw) throw new Error('direct room shader failed')
  }
  renderer.clearDepth = () => {}

  let atmosphere: SceneAtmosphereSource | null = null
  function ObserveAtmosphere() {
    atmosphere = useSceneAtmosphere()
    return null
  }
  const view = (daylightActive: boolean, disablePostFx: boolean) => (
    <>
      {daylightActive && <DaylightAtmosphere />}
      <ObserveAtmosphere />
      <PostProcessing disablePostFx={disablePostFx} />
    </>
  )
  const activeRooms = () => {
    if (!isDaylightAtmosphere(atmosphere)) throw new Error('Daylight atmosphere is unavailable')
    return atmosphere.rooms
  }

  const error = spyOn(console, 'error').mockImplementation(() => {})
  const restoreNavigator = mockNavigator({})
  let root: Awaited<ReturnType<typeof create>> | undefined
  try {
    root = await create(view(true, false), { gl: renderer })
    const firstRooms = activeRooms()
    expect(firstRooms.roomPassAvailable).toBe(false)
    await root.advanceFrames(1, 0.016)
    expect(firstRooms.roomPassAvailable).toBe(false)
    expect(usedRoomContext.splice(0)).toEqual([false, false])

    await root.update(view(true, true))
    await root.advanceFrames(1, 0.016)
    expect(firstRooms.roomPassAvailable).toBe(true)
    expect(usedRoomContext.splice(0)).toEqual([true, false])

    failRoomDraw = true
    await root.advanceFrames(1, 0.016)
    expect(firstRooms.roomPassAvailable).toBe(false)
    expect(renderer.contextNode).toBe(baseContext)
    expect(usedRoomContext.splice(0)).toEqual([true])
    await root.advanceFrames(1, 0.016)
    expect(usedRoomContext.splice(0)).toEqual([false, false])

    await root.update(view(false, true))
    expect(atmosphere).toBeNull()
    await root.advanceFrames(1, 0.016)
    expect(usedRoomContext.splice(0)).toEqual([false, false])
    failRoomDraw = false
    await root.update(view(true, true))
    const secondRooms = activeRooms()
    expect(secondRooms).not.toBe(firstRooms)
    expect(secondRooms.roomPassAvailable).toBe(false)
    await root.advanceFrames(1, 0.016)
    expect(secondRooms.roomPassAvailable).toBe(true)
    expect(usedRoomContext).toEqual([true, false])
  } finally {
    await root?.unmount()
    restoreNavigator()
    error.mockRestore()
  }
})

test('rebuilding a repeatedly failing daylight pipeline does not reset its retry budget', async () => {
  const renderer = makeRenderer()
  renderer.render = () => {}
  renderer.clearDepth = () => {}
  const draw = spyOn(RenderPipeline.prototype, 'render').mockImplementation(() => {
    throw new Error('daylight shader failed')
  })
  const error = spyOn(console, 'error').mockImplementation(() => {})
  const restoreNavigator = mockNavigator({ gpu: {} })
  let root: Awaited<ReturnType<typeof create>> | undefined
  try {
    root = await create(
      <>
        <DaylightAtmosphere />
        <PostProcessing />
      </>,
      { gl: renderer },
    )
    jest.useFakeTimers()
    for (let frame = 0; frame < 5; frame++) {
      await root.advanceFrames(1, 0.016)
      await act(async () => {
        jest.advanceTimersByTime(500)
      })
    }
    expect(draw).toHaveBeenCalledTimes(4)
    expect(error).toHaveBeenCalledWith(
      '[viewer/post-processing] Retries exhausted. Rendering without post FX for this session.',
    )
  } finally {
    jest.useRealTimers()
    await root?.unmount()
    restoreNavigator()
    draw.mockRestore()
    error.mockRestore()
  }
})
