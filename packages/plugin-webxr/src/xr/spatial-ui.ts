import type { Object3D, Raycaster } from 'three'
import { XR_WAND_PANEL_INPUT_NAME } from './wand/panel-layout'

// Keep the existing root name compatible with integrations using the wand API.
export const SPATIAL_UI_ROOT_NAMES = [XR_WAND_PANEL_INPUT_NAME, 'xr-workspace-hand-shortcut', 'xr-entry-preview'] as const

export function isSpatialUIObject(object: Object3D | null | undefined): boolean {
  let found = false
  for (let current = object; current; current = current.parent) {
    if (!current.visible || current.pointerEvents === 'none') return false
    if (SPATIAL_UI_ROOT_NAMES.some((name) => name === current.name)) found = true
  }
  return found
}

export function rayHitsSpatialUI(scene: Object3D, raycaster: Raycaster): boolean {
  return SPATIAL_UI_ROOT_NAMES.some((name) => {
    const root = scene.getObjectByName(name)
    if (!root) return false
    root.updateWorldMatrix(true, true)
    return raycaster.intersectObject(root, true).some((hit) => isSpatialUIObject(hit.object))
  })
}

// A UI press keeps ownership when its ray leaves the surface. Human-mode hand
// locomotion also respects hover; God-mode grip/palm navigation is independent.
export class SpatialUIInputOwnership {
  private inputs = new Map<XRInputSource, { hovering: boolean; pressed: boolean }>()

  hover(source: XRInputSource, hovering: boolean) {
    const input = this.inputs.get(source) ?? { hovering: false, pressed: false }
    input.hovering = hovering
    this.inputs.set(source, input)
  }

  press(source: XRInputSource, onUI: boolean) {
    const input = this.inputs.get(source) ?? { hovering: false, pressed: false }
    input.pressed = onUI
    this.inputs.set(source, input)
  }

  release(source: XRInputSource) {
    const input = this.inputs.get(source)
    if (input) input.pressed = false
  }

  remove(source: XRInputSource) {
    this.inputs.delete(source)
  }

  busy(handedness: XRHandedness) {
    for (const [source, input] of this.inputs) {
      if (source.handedness === handedness && (input.hovering || input.pressed)) return true
    }
    return false
  }
}

export const spatialUIInputOwnership = new SpatialUIInputOwnership()
