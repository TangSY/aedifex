'use client'

import { useTerrainPanelRows } from '@aedifex/editor'
import type { XRWandSettingsModel } from '../../../../xr/wand'

export function useAedifexXRWandTerrainModel(): XRWandSettingsModel {
  const rows = useTerrainPanelRows()
  return { rows, title: 'Terrain', mark: `${rows.length} controls`, page: 0, pageCount: 1 }
}
