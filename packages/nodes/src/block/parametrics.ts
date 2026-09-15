import type { ParametricDescriptor } from '@aedifex/core'
import type { BlockNode } from './schema'

export const blockParametrics: ParametricDescriptor<BlockNode> = {
  groups: [
    {
      label: 'Position',
      fields: [{ key: 'position', kind: 'vec3' }],
    },
  ],
  customPanel: () => import('./panel'),
}
