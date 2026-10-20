import { emitter } from '@aedifex/core'
import { useEditor } from '@aedifex/editor'
import { useViewer } from '@aedifex/viewer'
import useCabinetPlacementType from './placement-type'
import { type CabinetPresetId, cabinetPresetById } from './presets'

export function beginKitchenPlacement(id: CabinetPresetId) {
  emitter.emit('tool:cancel')
  const editor = useEditor.getState()
  useCabinetPlacementType.getState().setType('cabinet')
  editor.setToolDefaults('cabinet', { ...cabinetPresetById(id).createPatch(), kitchenPreset: id })
  editor.setContinuation('cabinet', 'single')
  useViewer.getState().setSelection({ selectedIds: [], zoneId: null })
  editor.setPhase('building')
  editor.setCatalogCategory(null)
  editor.armToolMode({ mode: 'build', tool: 'cabinet' })
}
