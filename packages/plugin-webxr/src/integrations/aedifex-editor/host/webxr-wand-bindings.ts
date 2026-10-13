'use client'

import { useEditor } from '@aedifex/editor'
import type { AedifexXRWandBindings } from '../wand/bindings'
import {
  activateBuildTool,
  activateModularCabinetTool,
  activatePaintMode,
  activateRoofFeatureTool,
  activateRoofFootprintSource,
  activateRoofType,
  activateSelectMode,
  activateTerrainSculptMode,
  collectBuildTypes,
  collectRoofFeatures,
  MEP_ITEMS,
} from './build-palette'
import { useBuildPanelModel, useBuildToolOptions } from './build-panel-model'
import { getRoofFootprintSources, ROOF_TYPE_OPTIONS } from './build-tab-state'

export const webXRWandBindings: AedifexXRWandBindings = {
  useBuildPalette: useBuildPanelModel,
  useToolOptions: useBuildToolOptions,
  activateBuildTool,
  activateModularCabinetTool,
  activatePaintMode,
  activateRoofFeatureTool,
  activateRoofFootprintSource,
  activateRoofType,
  activateSelectMode: () => {
    activateSelectMode()
    useEditor.getState().setTool(null)
  },
  activateTerrainSculptMode,
  collectBuildTypes,
  collectRoofFeatures,
  getRoofFootprintSources,
  roofTypeOptions: ROOF_TYPE_OPTIONS,
  xrMepItems: MEP_ITEMS,
}
