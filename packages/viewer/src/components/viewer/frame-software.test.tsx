import { expect, test } from 'bun:test'
import { useFrame, useThree } from '@react-three/fiber'
import { create } from '@react-three/test-renderer'
import FrameLimiter from './frame-limiter'

test('the mounted frame loop honors software and host frame limits', async () => {
  const saved = {
    window: (globalThis as { window?: unknown }).window,
    document: (globalThis as { document?: unknown }).document,
    raf: globalThis.requestAnimationFrame,
    caf: globalThis.cancelAnimationFrame,
    add: globalThis.addEventListener,
    remove: globalThis.removeEventListener,
  }
  const frames: FrameRequestCallback[] = []
  const listeners = { addEventListener: () => {}, removeEventListener: () => {} }
  Object.assign(globalThis, {
    window: Object.assign(globalThis, listeners),
    document: { ...listeners, visibilityState: 'visible' },
    requestAnimationFrame: (callback: FrameRequestCallback) => frames.push(callback),
    cancelAnimationFrame: () => {},
  })
  async function run(software: boolean, fps: number) {
    let count = 0
    frames.length = 0
    function SetBackend() {
      const gl = useThree((state) => state.gl)
      ;(gl as unknown as { backend: unknown }).backend = {
        device: { adapterInfo: { isFallbackAdapter: software } },
      }
      return null
    }
    function Count() {
      useFrame(() => {
        count++
      })
      return null
    }
    const renderer = await create(
      <>
        <SetBackend />
        <FrameLimiter fps={fps} />
        <Count />
      </>,
    )
    try {
      for (let time = 0; time <= 200; time += 10) frames.shift()?.(time)
      return count
    } finally {
      await renderer.unmount()
    }
  }
  try {
    expect(await run(true, 50)).toBe(4)
    expect(await run(true, 10)).toBe(2)
    expect(await run(false, 50)).toBe(10)
  } finally {
    for (const key of ['window', 'document'] as const) {
      if (saved[key] === undefined) Reflect.deleteProperty(globalThis, key)
      else Object.assign(globalThis, { [key]: saved[key] })
    }
    Object.assign(globalThis, {
      requestAnimationFrame: saved.raf,
      cancelAnimationFrame: saved.caf,
      addEventListener: saved.add,
      removeEventListener: saved.remove,
    })
  }
})
