import type { ParametricDescriptor, StairSegmentNode } from '@aedifex/core'

export const stairSegmentParametrics: ParametricDescriptor<StairSegmentNode> = {
  groups: [],
  customPanel: () => import('./panel'),
}
