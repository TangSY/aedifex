import type { ElevatorNode, ParametricDescriptor } from '@aedifex/core'

export const elevatorParametrics: ParametricDescriptor<ElevatorNode> = {
  groups: [],
  customPanel: () => import('./panel'),
}
