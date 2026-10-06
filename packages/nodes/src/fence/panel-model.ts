import type { FenceNode } from '@aedifex/core'
import type { NodePanelModel } from '@aedifex/editor'
import { beginFenceFeaturePlacement } from './features'

export const fencePanelModel: NodePanelModel<FenceNode> = {
  rows() {
    return (['gate', 'opening'] as const).map((kind) => ({
      id: `add-${kind}`,
      kind: 'action',
      section: 'Gates & openings',
      label: kind === 'gate' ? 'Add Gate' : 'Add Opening',
      onSelect: () => beginFenceFeaturePlacement(kind),
    }))
  },
}
