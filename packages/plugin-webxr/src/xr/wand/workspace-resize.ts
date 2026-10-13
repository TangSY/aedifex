import { Matrix4, Vector3 } from 'three'
import { XR_WAND_PANEL_SCALE_MAX, XR_WAND_PANEL_SCALE_MIN } from './panel-settings'

/** Resize in the panel's starting plane, independent of its changing content scale. */
export class WorkspaceResize {
  pointerId: number | null = null
  private inverse = new Matrix4()
  private startPoint = new Vector3()
  private point = new Vector3()
  private startScale = 1

  start(pointerId: number, worldPoint: Vector3, panelMatrix: Matrix4, scale: number) {
    if (this.pointerId !== null || !worldPoint.toArray().every(Number.isFinite) ||
      !panelMatrix.elements.every(Number.isFinite) || Math.abs(panelMatrix.determinant()) < 1e-10 ||
      !Number.isFinite(scale) || scale <= 0) return false
    this.inverse.copy(panelMatrix).invert()
    this.startPoint.copy(worldPoint).applyMatrix4(this.inverse).setZ(0)
    if (this.startPoint.lengthSq() < 0.0001) return false
    this.startScale = scale
    this.pointerId = pointerId
    return true
  }

  move(pointerId: number, worldPoint: Vector3) {
    if (pointerId !== this.pointerId || !worldPoint.toArray().every(Number.isFinite)) return undefined
    this.point.copy(worldPoint).applyMatrix4(this.inverse).setZ(0)
    const scale = this.startScale * this.point.dot(this.startPoint) / this.startPoint.lengthSq()
    return Math.min(XR_WAND_PANEL_SCALE_MAX, Math.max(XR_WAND_PANEL_SCALE_MIN, scale))
  }

  end(pointerId: number) {
    if (this.pointerId !== pointerId) return false
    this.pointerId = null
    return true
  }
}
