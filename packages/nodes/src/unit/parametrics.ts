import type { ParametricDescriptor, UnitNode } from '@aedifex/core'

export const unitParametrics: ParametricDescriptor<UnitNode> = {
  groups: [],
  customPanel: () => import('./unit-panel'),
}
