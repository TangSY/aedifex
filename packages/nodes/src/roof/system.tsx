'use client'

import { RoofSystem } from '@aedifex/viewer'
import { glazedRoofGeometryAdapter } from './glazed-geometry'

export default function RoofSystems() {
  return <RoofSystem geometryAdapter={glazedRoofGeometryAdapter} />
}
