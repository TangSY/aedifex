import { expect, test } from 'bun:test'
import { shouldRecallWorkspaceForSelection } from './workspace-selection'

test('only a completed scene selection recalls the workspace', () => {
  expect(shouldRecallWorkspaceForSelection('chair', ['chair'], 'select', 'idle')).toBe(true)
  expect(shouldRecallWorkspaceForSelection('chair', [], 'select', 'idle')).toBe(false)
  expect(shouldRecallWorkspaceForSelection('chair', ['wall'], 'select', 'idle')).toBe(false)
  expect(shouldRecallWorkspaceForSelection('chair', ['chair'], 'paint', 'idle')).toBe(false)
  expect(shouldRecallWorkspaceForSelection('chair', ['chair'], 'build', 'idle')).toBe(false)
  expect(shouldRecallWorkspaceForSelection('chair', ['chair'], 'select', 'dragging')).toBe(false)
})
