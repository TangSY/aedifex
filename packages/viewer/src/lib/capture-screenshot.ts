import { sceneRegistry, useScene } from '@aedifex/core'
import * as THREE from 'three'
import { snapLevelsToTruePositions } from '../systems/level/level-utils'

// ============================================================================
// Screenshot Renderer Context
// ============================================================================

/** Shared ref to the active renderer context, set by the host component */
let activeRendererContext: {
  gl: THREE.WebGLRenderer
  scene: THREE.Scene
} | null = null

/** Register the renderer and scene for screenshot capture. Call from a R3F component's useEffect. */
export function setScreenshotRenderer(gl: THREE.WebGLRenderer, scene: THREE.Scene) {
  activeRendererContext = { gl, scene }
}

/** Clear the renderer context. Call on component unmount. */
export function clearScreenshotRenderer() {
  activeRendererContext = null
}

// ============================================================================
// Screenshot API
// ============================================================================

export interface CaptureScreenshotOptions {
  width?: number
  height?: number
  /** Layer indices to disable on the capture camera (e.g. editor-only gizmos) */
  excludeLayers?: number[]
}

/**
 * Capture a screenshot of the current 3D scene as a JPEG data URL.
 * Returns null if the renderer is not available.
 */
export function captureScreenshot(
  options: CaptureScreenshotOptions = {},
): Promise<string | null> {
  const ctx = activeRendererContext
  if (!ctx) return Promise.resolve(null)

  const { width = 640, height = 360, excludeLayers = [] } = options
  const { gl, scene } = ctx

  return new Promise((resolve) => {
    try {
      const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000)

      const nodes = useScene.getState().nodes
      const siteNode = Object.values(nodes).find((n) => n.type === 'site')

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

      const { width: canvasW, height: canvasH } = gl.domElement
      camera.aspect = canvasW / canvasH
      camera.updateProjectionMatrix()

      const restoreLevels = snapLevelsToTruePositions()

      // Ensure scene has a background color for the screenshot.
      // AnimatedBackground sets scene.background via useFrame, but it may not
      // have executed yet (empty scene, first frame). Fall back to white if unset.
      const prevBackground = scene.background
      if (!scene.background) {
        scene.background = new THREE.Color('#ffffff')
      }

      // Hide scan/guide nodes
      const visibilitySnapshot = new Map<string, boolean>()
      for (const type of ['scan', 'guide'] as const) {
        sceneRegistry.byType[type].forEach((id) => {
          const obj = sceneRegistry.nodes.get(id)
          if (obj) {
            visibilitySnapshot.set(id, obj.visible)
            obj.visible = false
          }
        })
      }

      gl.render(scene, camera)

      // Restore original background
      scene.background = prevBackground

      restoreLevels()
      visibilitySnapshot.forEach((wasVisible, id) => {
        const obj = sceneRegistry.nodes.get(id)
        if (obj) obj.visible = wasVisible
      })

      // Crop and resize to target dimensions
      const srcAspect = canvasW / canvasH
      const dstAspect = width / height
      let sx = 0,
        sy = 0,
        sWidth = canvasW,
        sHeight = canvasH
      if (srcAspect > dstAspect) {
        sWidth = Math.round(canvasH * dstAspect)
        sx = Math.round((canvasW - sWidth) / 2)
      } else if (srcAspect < dstAspect) {
        sHeight = Math.round(canvasW / dstAspect)
        sy = Math.round((canvasH - sHeight) / 2)
      }

      const offscreen = document.createElement('canvas')
      offscreen.width = width
      offscreen.height = height
      const ctx2d = offscreen.getContext('2d')!
      ctx2d.drawImage(gl.domElement, sx, sy, sWidth, sHeight, 0, 0, width, height)

      resolve(offscreen.toDataURL('image/jpeg', 0.8))
    } catch {
      resolve(null)
    }
  })
}
