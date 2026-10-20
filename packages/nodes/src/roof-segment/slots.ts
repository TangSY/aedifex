import {
  type RoofSegmentNode,
  roofSegmentSlots as coreRoofSegmentSlots,
  type SlotDeclaration,
} from '@aedifex/core'
import { roofSlots, SLOT_DEFAULTS } from '../roof/slots'

export type { RoofSlotId as RoofSegmentSlotId } from '../roof/slots'

export const SEGMENT_SLOT_DEFAULTS = SLOT_DEFAULTS

export function roofSegmentSlots(node?: RoofSegmentNode): SlotDeclaration[] {
  return node ? coreRoofSegmentSlots(node) : roofSlots()
}
