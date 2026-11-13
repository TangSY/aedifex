import { configureArtifactStore, useScene } from '@aedifex/core'
import { useViewer } from '@aedifex/viewer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { runSharedAgentTool } from '../ai-shared-agent-executor'
import { createDefaultAIRuntime, resetAIRuntimeForTesting, setAIRuntime } from '../runtime'
import { getSceneOperations, resetSceneOperationsForTesting } from '../scene-operations-adapter'

const projectId = 'project_a'
let previousViewer: ReturnType<typeof useViewer.getState>

beforeEach(() => {
  previousViewer = useViewer.getState()
  resetSceneOperationsForTesting()
  const operations = getSceneOperations()
  operations.setScene({}, [])
  operations.loadDefault()
  operations.clearHistory()
  useScene.setState({ readOnly: false })
  useViewer.setState({ projectId })
  configureArtifactStore({ put: async (hash) => hash, text: async () => null, url: () => null })
})

afterEach(() => {
  configureArtifactStore(null)
  resetAIRuntimeForTesting()
  useViewer.setState(previousViewer, true)
})

it('uses the active project reader for author_scene', async () => {
  const read = vi.fn(async () =>
    new TextEncoder().encode(JSON.stringify({ levels: [{ name: 'Ground' }] })),
  )
  setAIRuntime({ ...createDefaultAIRuntime(), readProjectFile: read })
  const result = await runSharedAgentTool({
    name: 'author_scene',
    input: { payloadFile: 'asset_a' },
  })
  expect(result.result).toMatchObject({ verify: expect.any(Object) })
  expect(read).toHaveBeenCalledWith(
    expect.objectContaining({ projectId, fileId: 'asset_a', maxBytes: 32 * 1024 * 1024 }),
  )
})

it('does not apply a file read after the active project changes', async () => {
  const before = useScene.getState().nodes
  setAIRuntime({
    ...createDefaultAIRuntime(),
    readProjectFile: async () => {
      useViewer.setState({ projectId: 'project_b' })
      return new TextEncoder().encode(JSON.stringify({ levels: [{ name: 'Ground' }] }))
    },
  })
  await expect(
    runSharedAgentTool({ name: 'author_scene', input: { payloadFile: 'asset_a' } }),
  ).rejects.toMatchObject({ code: 'scene_changed' })
  expect(useScene.getState().nodes).toBe(before)
})
