import { expect, test } from 'bun:test'
import { Color, PerspectiveCamera, Scene } from 'three'
import { OVERLAY_LAYER } from '../../lib/layers'
import { renderDirectWithOverlays } from './direct-overlay'

test.each([false, true])(
  'direct rendering draws the overlay exactly once (initially enabled: %s)',
  (enabled) => {
    const camera = new PerspectiveCamera()
    if (enabled) camera.layers.enable(OVERLAY_LAYER)
    const originalMask = camera.layers.mask
    const scene = new Scene()
    scene.background = new Color('red')
    const calls: Array<{ mask: number; background: unknown; autoClear: boolean }> = []
    const renderer = {
      autoClear: true,
      clearDepth: () => {
        calls.push({ mask: -1, background: scene.background, autoClear: renderer.autoClear })
      },
      render: () => {
        calls.push({
          mask: camera.layers.mask,
          background: scene.background,
          autoClear: renderer.autoClear,
        })
      },
    }
    renderDirectWithOverlays({ renderer, scene, camera })
    expect(calls.map((call) => call.mask)).toEqual([
      originalMask & ~(1 << OVERLAY_LAYER),
      -1,
      1 << OVERLAY_LAYER,
    ])
    expect(calls[2]).toMatchObject({ background: null, autoClear: false })
    expect(camera.layers.mask).toBe(originalMask)
    expect(renderer.autoClear).toBe(true)
    expect(scene.background).toBeInstanceOf(Color)
  },
)

test.each(['scene', 'depth clear', 'overlay'] as const)(
  'renderer and scene state are restored when %s fails',
  (failure) => {
    const camera = new PerspectiveCamera()
    camera.layers.enable(OVERLAY_LAYER)
    const originalMask = camera.layers.mask
    const scene = new Scene()
    scene.background = new Color('red')
    const backgroundNode = {} as NonNullable<Scene['backgroundNode']>
    scene.backgroundNode = backgroundNode
    let count = 0
    const renderer = {
      autoClear: false,
      clearDepth: () => {
        if (failure === 'depth clear') throw Error('draw failed')
      },
      render: () => {
        count++
        if ((failure === 'scene' && count === 1) || (failure === 'overlay' && count === 2))
          throw Error('draw failed')
      },
    }
    expect(() => renderDirectWithOverlays({ renderer, scene, camera })).toThrow('draw failed')
    expect(camera.layers.mask).toBe(originalMask)
    expect(renderer.autoClear).toBe(false)
    expect(scene.background).toBeInstanceOf(Color)
    expect(scene.backgroundNode).toBe(backgroundNode)
  },
)
