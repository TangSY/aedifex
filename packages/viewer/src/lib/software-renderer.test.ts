import { expect, test } from 'bun:test'
import { isSoftwareRenderer, viewerFrameRate } from './software-renderer'

test('detects known software backends without classifying unknown or real GPUs as software', () => {
  const webgl = (name: string) => ({
    backend: { gl: { RENDERER: 1, getExtension: () => null, getParameter: () => name } },
  })
  expect(isSoftwareRenderer(webgl('ANGLE (SwiftShader Device)'))).toBe(true)
  expect(isSoftwareRenderer(webgl('llvmpipe (LLVM)'))).toBe(true)
  expect(
    isSoftwareRenderer({ backend: { device: { adapterInfo: { isFallbackAdapter: true } } } }),
  ).toBe(true)
  expect(
    isSoftwareRenderer({ backend: { device: { adapterInfo: { description: 'Apple M2 Pro' } } } }),
  ).toBe(false)
  expect(isSoftwareRenderer(webgl('NVIDIA RTX'))).toBe(false)
  expect(
    isSoftwareRenderer({
      backend: {
        gl: {
          RENDERER: 1,
          getExtension: () => {
            throw Error('blocked')
          },
          getParameter: () => 'llvmpipe',
        },
      },
    }),
  ).toBe(true)
  expect(
    isSoftwareRenderer({
      backend: {
        gl: {
          RENDERER: 1,
          getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 2 }),
          getParameter: (parameter: number) => {
            if (parameter === 2) throw Error('blocked')
            return 'SwiftShader'
          },
        },
      },
    }),
  ).toBe(true)
  expect(isSoftwareRenderer({})).toBe(false)
  expect(
    isSoftwareRenderer({
      backend: {
        gl: {
          RENDERER: 1,
          getExtension: () => {
            throw Error('unavailable')
          },
        },
      },
    }),
  ).toBe(false)
})

test('software caps respect lower host limits and retain invalid-value fallback', () => {
  expect(viewerFrameRate({ fps: 60, software: true })).toBe(20)
  expect(viewerFrameRate({ fps: 10, software: true })).toBe(10)
  expect(viewerFrameRate({ fps: 60, software: false })).toBe(60)
  expect(viewerFrameRate({ fps: NaN, software: true })).toBe(20)
  expect(viewerFrameRate({ fps: 0, software: false })).toBe(50)
})
