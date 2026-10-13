import type { ParametricDescriptor, ZoneNode } from '@aedifex/core'

export const zoneParametrics: ParametricDescriptor<ZoneNode> = {
  groups: [],
  trailingSection: () => import('./quantities-panel'),
}
