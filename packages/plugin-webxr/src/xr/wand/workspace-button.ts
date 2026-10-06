/** Distinguish a toggle on release from a rescue after holding Y. */
export class WorkspaceButton {
  private pressed = false
  private elapsed = 0
  private rescued = false

  reset() {
    this.pressed = false
    this.elapsed = 0
    this.rescued = false
  }

  update(pressed: boolean, delta: number): 'toggle' | 'rescue' | undefined {
    if (!pressed) {
      const toggle = this.pressed && !this.rescued
      this.reset()
      return toggle ? 'toggle' : undefined
    }
    if (!this.pressed) {
      this.pressed = true
      this.elapsed = 0
    } else {
      this.elapsed += delta
    }
    if (!this.rescued && this.elapsed >= 0.65) {
      this.rescued = true
      return 'rescue'
    }
  }
}
