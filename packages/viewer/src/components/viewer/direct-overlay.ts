import type { Camera, Scene } from 'three'
import { OVERLAY_LAYER } from '../../lib/layers'

type DirectRenderer = {
  autoClear: boolean
  clearDepth(): void
  render(scene: Scene, camera: Camera): void
}

export function renderDirectWithOverlays({
  renderer,
  scene,
  camera,
}: {
  renderer: DirectRenderer
  scene: Scene
  camera: Camera
}): void {
  const mask = camera.layers.mask
  const autoClear = renderer.autoClear
  const background = scene.background
  const backgroundNode = scene.backgroundNode
  try {
    camera.layers.disable(OVERLAY_LAYER)
    renderer.render(scene, camera)
    camera.layers.set(OVERLAY_LAYER)
    renderer.autoClear = false
    scene.background = null
    scene.backgroundNode = null
    renderer.clearDepth()
    renderer.render(scene, camera)
  } finally {
    camera.layers.mask = mask
    renderer.autoClear = autoClear
    scene.background = background
    scene.backgroundNode = backgroundNode
  }
}
