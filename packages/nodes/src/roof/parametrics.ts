import type { ParametricDescriptor, RoofNode } from '@aedifex/core'

export const roofParametrics: ParametricDescriptor<RoofNode> = {
  groups: [],
  customPanel: () => import('./panel'),
}
