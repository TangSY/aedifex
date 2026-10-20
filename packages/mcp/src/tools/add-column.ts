import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { isScriptedNode, scriptedObjectMeta } from '@aedifex/core'
import {
  type AddColumnInput,
  addColumn,
  columnScriptParams,
  editedScriptLanguage,
} from '@aedifex/core/agent-operations'
import { addColumnTool, isAgentRefusal, refuse } from '@aedifex/core/agent-tools'
import { type AnyNode, GeometryReuseFields } from '@aedifex/core/schema'
import type { SceneOperations } from '../operations'
import {
  assertGeometrySceneCurrent,
  compileAndStore,
  type GeometryScriptHost,
  readScript,
} from './add-object'
import { DESTRUCTIVE_TOOL_ANNOTATIONS } from './annotations'
import { refusalResult, toolError } from './errors'
import { persistencePayload, publishLiveSceneSnapshot } from './live-sync'
import { toPatches } from './shared-tools'

export function registerAddColumn(
  server: McpServer,
  bridge: SceneOperations,
  host?: GeometryScriptHost,
) {
  server.registerTool(
    addColumnTool.name,
    {
      title: addColumnTool.title,
      description: addColumnTool.description,
      inputSchema: addColumnTool.input,
      annotations: DESTRUCTIVE_TOOL_ANNOTATIONS,
    },
    async (input: AddColumnInput) => {
      try {
        const nodes = bridge.getNodes() as Record<string, AnyNode>
        const previous = input.nodeId ? nodes[input.nodeId] : undefined
        const params = columnScriptParams(previous?.type === 'column' ? previous : undefined, input)
        let compiled: AddColumnInput['compiled']
        if (params) {
          if (!host)
            refuse('scripts_unavailable', 'This Aedifex server cannot run geometry scripts.')
          const scene = bridge.getActiveScene()
          if (!scene) refuse('no_active_scene', 'Open or save a scene first.')
          const code = input.code ?? (await readScript(host, scene.id, bridge, input.nodeId!))
          const language = editedScriptLanguage(previous, input)
          compiled = await compileAndStore(host, scene.id, { code, language, params }, 'column', {
            nodeId: input.nodeId,
            metadata: {
              ...(isScriptedNode(previous) ? scriptedObjectMeta(previous) : {}),
              ...GeometryReuseFields.parse(input),
            },
          })
          assertGeometrySceneCurrent({ bridge, sceneId: scene.id })
        }
        const outcome = addColumn(bridge.getNodes(), { ...input, compiled }, { activeLevelId: bridge.activeLevelId?.() ?? null })
        if (outcome.changes) {
          const patches = toPatches(outcome.changes)
          if (compiled) bridge.applyCompiledGeometryPatch({ patches, compiled })
          else bridge.applyPatch(patches)
        }
        const payload = {
          ...outcome.result,
          ...persistencePayload(await publishLiveSceneSnapshot(bridge, addColumnTool.name)),
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
          structuredContent: payload,
        }
      } catch (error) {
        if (isAgentRefusal(error)) return refusalResult(error)
        return toolError(error instanceof Error ? error.message : String(error), {
          code: 'script_failed',
        })
      }
    },
  )
}
