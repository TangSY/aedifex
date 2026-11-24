import type { Camera, Scene } from 'three'
import type { ContextNode } from 'three/webgpu'
import { OVERLAY_LAYER } from '../../lib/layers'

type DirectRenderer = {
  autoClear: boolean
  contextNode?: ContextNode<unknown>
  clearDepth(): void
  render(scene: Scene, camera: Camera): void
}

export function renderDirectWithOverlays({
  renderer,
  scene,
  camera,
  contextNode,
}: {
  renderer: DirectRenderer
  scene: Scene
  camera: Camera
  contextNode?: ContextNode<unknown>
}): void {
  const mask = camera.layers.mask
  const autoClear = renderer.autoClear
  const savedContext = renderer.contextNode
  const background = scene.background
  const backgroundNode = scene.backgroundNode
  try {
    camera.layers.disable(OVERLAY_LAYER)
    if (contextNode) renderer.contextNode = contextNode
    renderer.render(scene, camera)
    if (contextNode) renderer.contextNode = savedContext
    camera.layers.set(OVERLAY_LAYER)
    renderer.autoClear = false
    scene.background = null
    scene.backgroundNode = null
    renderer.clearDepth()
    renderer.render(scene, camera)
  } finally {
    if (contextNode) renderer.contextNode = savedContext
    camera.layers.mask = mask
    renderer.autoClear = autoClear
    scene.background = background
    scene.backgroundNode = backgroundNode
  }
}
