import { afterEach, describe, expect, it, vi } from 'vitest'
import { emitter } from '@aedifex/core'
import { requestSceneView } from '../ai-scene-view'

const plan = {
  pose: {
    projection: 'perspective' as const,
    position: [3, 4, 5] as [number, number, number],
    target: [0, 0, 0] as [number, number, number],
    fov: 45,
  },
  size: { w: 1280, h: 800 },
}

afterEach(() => vi.useRealTimers())

describe('view_scene snapshot request', () => {
  it('uses the existing renderer event, answers the matching ephemeral frame and leaves the live pose alone', async () => {
    const capture = vi.fn((event) => {
      expect(event).toMatchObject({
        ephemeral: true,
        perspective: plan.pose,
        standardSize: plan.size,
      })
      emitter.emit('snapshot:captured', {
        requestId: 'another-view',
        blob: new Blob(),
        width: 1,
        height: 1,
      })
      emitter.emit('snapshot:captured', {
        requestId: event.requestId,
        blob: new Blob(['png'], { type: 'image/png' }),
        width: 1280,
        height: 800,
      })
    })
    emitter.on('camera-controls:generate-thumbnail', capture)
    try {
      expect(await requestSceneView({ plan })).toMatchObject({ width: 1280, height: 800 })
      expect(capture).toHaveBeenCalledOnce()
    } finally {
      emitter.off('camera-controls:generate-thumbnail', capture)
    }
  })

  it('ends waiting on abort and does not let a missing renderer strand the loop', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const aborted = requestSceneView({ plan, signal: controller.signal })
    const rejected = expect(aborted).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await rejected
    const timedOut = requestSceneView({ plan })
    const timeout = expect(timedOut).rejects.toThrow('did not return a view')
    await vi.advanceTimersByTimeAsync(45_000)
    await timeout
  })
})
