import {
  ROOF_FASCIA_SLOT_DEFAULT,
  ROOF_GABLE_SLOT_DEFAULT,
  ROOF_SHINGLE_SLOT_DEFAULT,
  ROOF_SOFFIT_SLOT_DEFAULT,
  type RoofSlotId,
  type SlotDeclaration,
} from '@aedifex/core'

// Roof exposes four paintable slots — the visible cladding (`shingle`), the
// eave/edge trim (`fascia`), the wall/gable band that shows between the deck
// and the walls below (`gable`), and the underside (`soffit`). These match
// the four material groups the merged-roof mesh renders with in the viewer.
// The declared defaults come from core so the slot declaration (nodes) and
// the material resolver (viewer) share one value.
export type { RoofSlotId } from '@aedifex/core'

export const ROOF_SLOT_ORDER: readonly RoofSlotId[] = ['shingle', 'gable', 'fascia', 'soffit']

export const SLOT_DEFAULTS: Record<RoofSlotId, string> = {
  shingle: ROOF_SHINGLE_SLOT_DEFAULT,
  gable: ROOF_GABLE_SLOT_DEFAULT,
  fascia: ROOF_FASCIA_SLOT_DEFAULT,
  soffit: ROOF_SOFFIT_SLOT_DEFAULT,
}

export function roofSlots(): SlotDeclaration[] {
  return [
    { slotId: 'shingle', label: 'Shingle', default: ROOF_SHINGLE_SLOT_DEFAULT },
    { slotId: 'gable', label: 'Gable', default: ROOF_GABLE_SLOT_DEFAULT },
    { slotId: 'fascia', label: 'Fascia', default: ROOF_FASCIA_SLOT_DEFAULT },
    { slotId: 'soffit', label: 'Soffit', default: ROOF_SOFFIT_SLOT_DEFAULT },
  ]
}
