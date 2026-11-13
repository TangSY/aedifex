type RendererLike = {
  backend?: {
    device?: {
      adapterInfo?: {
        vendor?: string
        architecture?: string
        description?: string
        device?: string
        isFallbackAdapter?: boolean
      }
    }
    gl?: {
      RENDERER: number
      getExtension(name: string): { UNMASKED_RENDERER_WEBGL?: number } | null
      getParameter(parameter: number): unknown
    }
  }
}

export function isSoftwareRenderer(renderer: unknown): boolean {
  const backend = (renderer as RendererLike | null)?.backend
  const info = backend?.device?.adapterInfo
  if (info?.isFallbackAdapter === true) return true
  const names = [info?.vendor, info?.architecture, info?.description, info?.device]
  const gl = backend?.gl
  if (gl) {
    let parameter = gl.RENDERER
    try {
      parameter = gl.getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL ?? parameter
    } catch {}
    try {
      names.push(String(gl.getParameter(parameter)))
    } catch {
      try {
        names.push(String(gl.getParameter(gl.RENDERER)))
      } catch {}
    }
  }
  return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(names.join(' '))
}

export function viewerFrameRate({ fps, software }: { fps: number; software: boolean }): number {
  const requested = Number.isFinite(fps) && fps > 0 ? fps : 50
  return software ? Math.min(requested, 20) : requested
}
