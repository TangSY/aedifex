import type { ParametricDescriptor, StairNode } from '@aedifex/core'

export const stairParametrics: ParametricDescriptor<StairNode> = {
  groups: [],
  customPanel: () => import('./panel'),
}
