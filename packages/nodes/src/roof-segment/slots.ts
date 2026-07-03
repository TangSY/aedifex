import type { SlotDeclaration } from '@aedifex/core'
import { roofSlots, SLOT_DEFAULTS } from '../roof/slots'

// A roof segment inherits the parent roof's slot layout — same four ids
// (`shingle` / `gable` / `fascia` / `soffit`), same declared defaults. A
// segment-level override still wins over the parent roof's slot when the
// viewer's slot-first resolver reads either node, so exposing the same list
// here lets the inspector paint a single segment without touching the parent.
export type { RoofSlotId as RoofSegmentSlotId } from '../roof/slots'

export const SEGMENT_SLOT_DEFAULTS = SLOT_DEFAULTS

export function roofSegmentSlots(): SlotDeclaration[] {
  return roofSlots()
}
