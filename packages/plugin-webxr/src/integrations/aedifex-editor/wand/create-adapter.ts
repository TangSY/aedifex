import type { XRWandAdapter } from '../../../xr/wand'
import type { AedifexXRWandBindings } from './bindings'
import { useAedifexXRWandItemsPanelModel } from './models/items-model'
import { useAedifexXRWandBuildModel } from './models/build-model'
import { useAedifexXRWandPaintModel } from './models/paint-model'
import { useAedifexXRWandSettingsModel } from './models/settings-model'

export function createAedifexXRWandAdapter(bindings: AedifexXRWandBindings): XRWandAdapter {
  return {
    useBuildModel: (options) => useAedifexXRWandBuildModel(bindings, options),
    useItemsModel: () => useAedifexXRWandItemsPanelModel(bindings),
    usePaintModel: () => useAedifexXRWandPaintModel(bindings),
    useSettingsModel: (options) => useAedifexXRWandSettingsModel(bindings, options),
  }
}
