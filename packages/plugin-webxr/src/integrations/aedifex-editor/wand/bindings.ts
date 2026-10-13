import type { RoofType } from '@aedifex/core'
import type { FloorplanMode } from '@aedifex/editor'
import type { PanelToolOption } from '@aedifex/editor'
import type { XRWandBuildModel } from '../../../xr/wand/adapter'

export type AedifexXRBuildType = {
  iconSrc: string
  id: string
  kind?: string
  label: string
  mode?: 'material-paint' | 'terrain-sculpt'
  paletteOrder?: number
}

export type AedifexXRMepItem = {
  iconSrc: string
  id: string
  kind: string
  label: string
}

export type AedifexXRRoofFeature = {
  iconSrc: string
  id: string
  kind?: string
  label: string
}

export type AedifexXRRoofFootprintSource = 'draw' | 'room' | 'walls'

export type AedifexXRWandBindings = {
  useBuildPalette: () => XRWandBuildModel
  useToolOptions: () => PanelToolOption[]
  activateBuildTool: (kind: string) => void
  activateModularCabinetTool: () => void
  activatePaintMode: () => void
  activateRoofFeatureTool: (feature: AedifexXRRoofFeature) => void
  activateRoofFootprintSource: (source: AedifexXRRoofFootprintSource) => void
  activateRoofType: (roofType: RoofType) => void
  activateSelectMode: () => void
  activateTerrainSculptMode: () => void
  collectBuildTypes: (floorplanMode: FloorplanMode) => AedifexXRBuildType[]
  collectRoofFeatures: () => AedifexXRRoofFeature[]
  getRoofFootprintSources: (roofType: RoofType) => readonly {
    label: string
    value: AedifexXRRoofFootprintSource
  }[]
  roofTypeOptions: ReadonlyArray<{ label: string; value: RoofType }>
  xrMepItems: readonly AedifexXRMepItem[]
}
