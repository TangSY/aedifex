import type { AssetInput, ItemNode } from '@aedifex/core'
import type { PlacementState } from './placement-types'

export function shouldCreateFloorDraft(
  draft: ItemNode | null,
  attachTo: AssetInput['attachTo'],
  surface: PlacementState['surface'],
): boolean {
  return draft === null && attachTo === undefined && surface === 'floor'
}
