import type { ConstructionDimensionNode, ParametricDescriptor } from '@aedifex/core'

export const constructionDimensionParametrics: ParametricDescriptor<ConstructionDimensionNode> = {
  groups: [],
  customPanel: () => import('./panel'),
}
