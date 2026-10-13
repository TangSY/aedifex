// IWER renders its XRWebGLLayer into the canvas (framebuffer === null).
// Three's unified WebGL backend otherwise treats every XR layer as a custom
// framebuffer and tries to use null as a WeakMap key for its draw buffers.
type DrawBufferState = {
  drawBuffers(context: { textures: unknown }, framebuffer: WebGLFramebuffer | null): void
}

export function supportEmulatedDefaultFramebuffer(state: DrawBufferState) {
  const original = state.drawBuffers
  state.drawBuffers = function (context, framebuffer) {
    if (framebuffer === null) {
      original.call(this, { ...context, textures: null }, framebuffer)
    } else {
      original.call(this, context, framebuffer)
    }
  }
  return () => {
    state.drawBuffers = original
  }
}
