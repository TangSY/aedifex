import type { Object3D } from 'three'
import { useXRPlayerMode } from './mode-switching/store/player-mode'

type R3FPointerObject = Object3D & {
  __r3f?: { eventCount?: number }
}

export function isDirectR3FPointerTarget(object: Object3D): boolean {
  return ((object as R3FPointerObject).__r3f?.eventCount ?? 0) > 0
}

export function isR3FPointerTarget(object: Object3D): boolean {
  if (useXRPlayerMode.getState().inputLocked) return false
  // Door/window systems intentionally hide their cutout selection proxy.
  // Only that proxy may bypass its own visibility, never a hidden ancestor.
  const openingProxy = object.name === 'cutout' && object.parent != null &&
    isDirectR3FPointerTarget(object.parent)
  for (let ancestor: Object3D | null = object; ancestor; ancestor = ancestor.parent) {
    if ((!ancestor.visible && !(ancestor === object && openingProxy)) || ancestor.pointerEvents === 'none') return false
  }
  let current: Object3D | null = object
  while (current) {
    if (current.children.some(isDirectR3FPointerTarget)) return false
    if (isDirectR3FPointerTarget(current)) return true
    current = current.parent
  }
  return false
}
