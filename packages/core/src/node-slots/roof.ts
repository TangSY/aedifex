import type { SlotDeclaration } from '../registry/types'
import { ROOF_SLOT_DEFAULTS, type RoofSlotId } from '../schema/nodes/roof'
import { getRoofGlazing, isGlazedRoofSegment } from '../schema/nodes/roof-glazing'
import type { RoofSegmentNode } from '../schema/nodes/roof-segment'
export const GLAZED_ROOF_SLOTS = ['glazing-frame', 'glazing-glass', 'glazing-solid'] as const
export function roofSlots(): SlotDeclaration[] {
  return (Object.keys(ROOF_SLOT_DEFAULTS) as RoofSlotId[]).map((slotId) => ({
    slotId,
    label: { shingle: 'Shingles', gable: 'Gable', fascia: 'Fascia', soffit: 'Soffit' }[slotId],
    default: ROOF_SLOT_DEFAULTS[slotId],
  }))
}

export function roofSegmentSlots(node: RoofSegmentNode): SlotDeclaration[] {
  if (!isGlazedRoofSegment(node)) return roofSlots()
  const config = getRoofGlazing(node)
  return GLAZED_ROOF_SLOTS.map((slotId, index) => ({
    slotId,
    label: ['Frame', 'Glass', 'Solid panels'][index]!,
    default: index === 1 ? config.glassColor : config.frameColor,
  }))
}
