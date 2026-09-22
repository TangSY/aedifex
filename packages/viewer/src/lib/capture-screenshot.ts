import { sceneRegistry, useScene } from '@aedifex/core'
import * as THREE from 'three/webgpu'
import { snapLevelsToTruePositions } from '../systems/level/level-utils'

type ScreenshotRenderer = {
  domElement: HTMLCanvasElement
  render: (scene: THREE.Scene, camera: THREE.Camera) => void
  renderAsync?: (scene: THREE.Scene, camera: THREE.Camera) => Promise<void>
  getClearAlpha?: () => number
  setClearAlpha?: (alpha: number) => void
}

let activeRendererContext: {
  renderer: ScreenshotRenderer
  scene: THREE.Scene
} | null = null

export function setScreenshotRenderer(renderer: ScreenshotRenderer, scene: THREE.Scene) {
  activeRendererContext = { renderer, scene }
}

export function clearScreenshotRenderer(renderer: ScreenshotRenderer) {
  if (activeRendererContext?.renderer === renderer) {
    activeRendererContext = null
  }
}

let captureCamera: THREE.PerspectiveCamera | null = null
let offscreenCanvas: HTMLCanvasElement | null = null

function getCaptureCamera(aspect: number) {
  if (!captureCamera) {
    captureCamera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000)
  }
  captureCamera.aspect = aspect
  captureCamera.layers.enableAll()
  return captureCamera
}

function getOffscreenCanvas(width: number, height: number) {
  if (!offscreenCanvas) {
    offscreenCanvas = document.createElement('canvas')
  }
  offscreenCanvas.width = width
  offscreenCanvas.height = height
  return offscreenCanvas
}

export interface CaptureScreenshotOptions {
  width?: number
  height?: number
  excludeLayers?: number[]
}

/**
 * Capture the active viewer as a JPEG Blob URL. The renderer bridge is owned
 * by Viewer, so consumers only need this high-level API.
 */
export async function captureScreenshot(
  options: CaptureScreenshotOptions = {},
): Promise<string | null> {
  const context = activeRendererContext
  if (!context || typeof document === 'undefined') return null

  const { width = 640, height = 360, excludeLayers = [] } = options
  const { renderer, scene } = context
  const camera = getCaptureCamera(width / height)
  const nodes = useScene.getState().nodes
  const siteNode = Object.values(nodes).find((node) => node.type === 'site')

  if (siteNode?.camera) {
    const { position, target } = siteNode.camera
    camera.position.set(position[0], position[1], position[2])
    camera.lookAt(target[0], target[1], target[2])
  } else {
    camera.position.set(8, 8, 8)
    camera.lookAt(0, 0, 0)
  }

  for (const layer of excludeLayers) {
    camera.layers.disable(layer)
  }

  const { width: canvasWidth, height: canvasHeight } = renderer.domElement
  if (canvasWidth === 0 || canvasHeight === 0) return null
  camera.aspect = canvasWidth / canvasHeight
  camera.updateProjectionMatrix()

  const restoreLevels = snapLevelsToTruePositions()
  const previousBackground = scene.background
  const previousClearAlpha = renderer.getClearAlpha?.() ?? 1
  const visibilitySnapshot = new Map<string, boolean>()

  try {
    scene.background = new THREE.Color('#ffffff')
    renderer.setClearAlpha?.(1)

    for (const type of ['scan', 'guide'] as const) {
      sceneRegistry.byType[type]?.forEach((id) => {
        const object = sceneRegistry.nodes.get(id)
        if (!object) return
        visibilitySnapshot.set(id, object.visible)
        object.visible = false
      })
    }

    if (renderer.renderAsync) {
      await renderer.renderAsync(scene, camera)
    } else {
      renderer.render(scene, camera)
    }

    const sourceAspect = canvasWidth / canvasHeight
    const targetAspect = width / height
    let sourceX = 0
    let sourceY = 0
    let sourceWidth = canvasWidth
    let sourceHeight = canvasHeight

    if (sourceAspect > targetAspect) {
      sourceWidth = Math.round(canvasHeight * targetAspect)
      sourceX = Math.round((canvasWidth - sourceWidth) / 2)
    } else if (sourceAspect < targetAspect) {
      sourceHeight = Math.round(canvasWidth / targetAspect)
      sourceY = Math.round((canvasHeight - sourceHeight) / 2)
    }

    const canvas = getOffscreenCanvas(width, height)
    const context2d = canvas.getContext('2d')
    if (!context2d) return null
    context2d.drawImage(
      renderer.domElement,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      width,
      height,
    )

    return await new Promise((resolve) => {
      canvas.toBlob(
        (blob) => resolve(blob ? URL.createObjectURL(blob) : null),
        'image/jpeg',
        0.8,
      )
    })
  } catch {
    return null
  } finally {
    scene.background = previousBackground
    renderer.setClearAlpha?.(previousClearAlpha)
    restoreLevels()
    visibilitySnapshot.forEach((wasVisible, id) => {
      const object = sceneRegistry.nodes.get(id)
      if (object) object.visible = wasVisible
    })
  }
}
