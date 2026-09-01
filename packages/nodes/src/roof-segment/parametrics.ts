import type { ParametricDescriptor, RoofSegmentNode } from '@aedifex/core'

export const roofSegmentParametrics: ParametricDescriptor<RoofSegmentNode> = {
  groups: [],
  customPanel: () => import('./panel'),
}
