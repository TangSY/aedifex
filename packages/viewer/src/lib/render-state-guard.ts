import type { Camera, Scene } from 'three'
import { RendererUtils, type WebGPURenderer } from 'three/webgpu'

/** Three's nested passes and cube captures restore their state only when drawing succeeds. */
export function createRenderStateGuard({
  renderer,
  scene,
  camera,
}: {
  renderer: WebGPURenderer
  scene: Scene
  camera?: Camera
}) {
  let rendererState: ReturnType<typeof RendererUtils.saveRendererState> | undefined
  let sceneState: ReturnType<typeof RendererUtils.saveSceneState> | undefined

  return function renderWithStateGuard<T>(draw: () => T): T {
    rendererState = RendererUtils.saveRendererState(renderer, rendererState)
    sceneState = RendererUtils.saveSceneState(scene, sceneState)
    const contextNode = renderer.contextNode
    const lighting = renderer.lighting
    const xrEnabled = renderer.xr.enabled
    const sceneName = scene.name
    const cameraMask = camera?.layers.mask

    try {
      return draw()
    } catch (error) {
      RendererUtils.restoreRendererState(renderer, rendererState)
      RendererUtils.restoreSceneState(scene, sceneState)
      renderer.contextNode = contextNode
      renderer.lighting = lighting
      renderer.xr.enabled = xrEnabled
      scene.name = sceneName
      if (camera && cameraMask !== undefined) camera.layers.mask = cameraMask
      throw error
    }
  }
}
