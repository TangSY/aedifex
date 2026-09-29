import { expect, test } from 'bun:test'
import { supportEmulatedDefaultFramebuffer } from './emulated-framebuffer'

test('routes IWER canvas frames to BACK, preserves native framebuffers, and restores on exit', () => {
  const calls: { textures: unknown; framebuffer: WebGLFramebuffer | null }[] = []
  const state = {
    drawBuffers(context: { textures: unknown }, framebuffer: WebGLFramebuffer | null) {
      calls.push({ textures: context.textures, framebuffer })
    },
  }
  const original = state.drawBuffers
  const restore = supportEmulatedDefaultFramebuffer(state)
  const context = { textures: ['color'] }
  state.drawBuffers(context, null)
  const nativeFramebuffer = {} as WebGLFramebuffer
  state.drawBuffers(context, nativeFramebuffer)
  expect(calls).toEqual([
    { textures: null, framebuffer: null },
    { textures: context.textures, framebuffer: nativeFramebuffer },
  ])
  expect(context.textures).toEqual(['color'])
  restore()
  expect(state.drawBuffers).toBe(original)
})
