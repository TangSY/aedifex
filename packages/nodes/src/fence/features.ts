import { emitter } from '@aedifex/core'
import { useEditor } from '@aedifex/editor'
import { useViewer } from '@aedifex/viewer'

export function beginFenceFeaturePlacement(kind: 'gate' | 'opening') {
  emitter.emit('tool:cancel')
  const editor = useEditor.getState()
  editor.setPhase('structure')
  editor.setStructureLayer('elements')
  editor.setMode('build')
  editor.setTool('fence')
  editor.setToolDefaults('fence', { featurePlacement: kind })
  useViewer.getState().setSelection({ selectedIds: [] })
}
