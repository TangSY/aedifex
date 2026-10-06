import {
  type AnyNode,
  type CompiledGeometryScript,
  getArtifactStore,
  nodeRegistry,
  useScene,
} from '@aedifex/core'
import {
  addColumn,
  type AddColumnInput,
  addObject,
  type AddObjectInput,
  AGENT_OPERATIONS,
  type AgentOperationOutcome,
  authoredObject,
  columnScriptParams,
  editCollection,
  listCollections,
  readSourceResult,
  rescriptOpening,
  STRUCTURE_OPERATIONS,
} from '@aedifex/core/agent-operations'
import { isAgentRefusal, refusalPayload, refuse } from '@aedifex/core/agent-tools'
import { planWallOpening } from '@aedifex/core/building'
import { useViewer } from '@aedifex/viewer'
import { z } from 'zod'
import { compileAndStoreGeometryScript, storedScript } from '../../lib/geometry-script/author'
import { useAIChat } from './ai-chat-store'
import { sharedAgentContracts, type SharedAgentToolName } from './contracts/shared-agent-tools'
import { confirmGhostPreview } from './preview/confirm-operations'
import type { AIOperationLog, AIToolCall, SharedAgentToolCall, ToolResult, ValidatedSharedAgentOperation } from './types'

export function isSharedAgentToolCall(call: AIToolCall): call is SharedAgentToolCall {
  return 'sharedInput' in call
}

/** Executes the shared contract once; compiling and storage are the browser host's part. */
export async function runSharedAgentTool({
  name,
  input,
  signal,
}: {
  name: SharedAgentToolName
  input: Record<string, unknown>
  signal?: AbortSignal
}): Promise<{ result: Record<string, unknown>; log?: AIOperationLog }> {
  const contract = sharedAgentContracts.get(name)!
  const args = z.object(contract.input).parse(input) as Record<string, unknown>
  const state = useScene.getState()
  const nodes = state.nodes as Record<string, AnyNode>
  const artifacts = getArtifactStore()
  const context = { activeLevelId: useViewer.getState().selection.levelId }
  const assertCurrent = () => {
    if (signal?.aborted) throw new DOMException('Agent loop aborted', 'AbortError')
    if (useScene.getState().nodes !== nodes || getArtifactStore() !== artifacts)
      refuse('scene_changed', 'The scene changed while the tool was running; retry on the current scene.')
  }
  const mutating = !['get_source', 'get_node', 'list_levels', 'get_level_summary', 'get_walls', 'get_zones', 'verify_scene', 'find_by_type', 'list_collections'].includes(name)
  const assertWritable = () => {
    assertCurrent()
    if (mutating && useScene.getState().readOnly)
      refuse('read_only', 'This scene is read-only; no changes were made.')
  }
  assertWritable()
  if (name in STRUCTURE_OPERATIONS) {
    const operation = STRUCTURE_OPERATIONS[name as keyof typeof STRUCTURE_OPERATIONS]
    const plan = operation(nodes, args as never)
    if (plan.conflicts?.length && !args.force)
      refuse('structure_conflict', 'This structure edit conflicts with the existing scene.', { conflicts: plan.conflicts })
    const outcome: AgentOperationOutcome = { result: {} }
    const log = confirmGhostPreview([{
      type: 'shared_agent', toolName: name, status: 'valid', outcome,
      structurePlan: plan, force: args.force === true,
    }])
    return { result: outcome.result, log }
  }
  let compiledOutput: CompiledGeometryScript | undefined
  const compile = async (params = args.params as AddObjectInput['params']) => {
    const compiled = await compileAndStoreGeometryScript({
      code: args.code as string | undefined,
      nodeId: args.nodeId as string | undefined,
      params,
      assertCurrent: assertWritable,
    })
    assertWritable()
    compiledOutput = compiled
    return compiled
  }

  let outcome: AgentOperationOutcome
  switch (name) {
    case 'get_source': {
      const node = authoredObject(nodes, args.nodeId as string)
      const code = await storedScript(node.id)
      assertCurrent()
      return { result: readSourceResult(node, code) }
    }
    case 'add_object':
      outcome = addObject(nodes, { ...args, compiled: await compile() } as AddObjectInput, context)
      break
    case 'add_column': {
      const previous = args.nodeId ? nodes[args.nodeId as string] : undefined
      const params = columnScriptParams(previous?.type === 'column' ? previous : undefined, args)
      outcome = addColumn(nodes, {
        ...args,
        ...(params ? { compiled: await compile(params) } : {}),
      } as AddColumnInput, context)
      break
    }
    case 'add_door':
    case 'add_window': {
      const kind = name === 'add_door' ? 'door' : 'window'
      if (args.nodeId) {
        const previous = nodes[args.nodeId as string]
        if (previous?.type !== kind)
          refuse('wrong_node_kind', `Rebuild a ${kind} with ${name}; this node is ${previous?.type ?? 'missing'}.`)
        outcome = rescriptOpening(nodes, { nodeId: args.nodeId as string, compiled: await compile() }, context)
      } else {
        const compiled = args.code ? await compile() : undefined
        const planned = planWallOpening(nodes, { ...args, kind, compiled } as Parameters<typeof planWallOpening>[1])
        outcome = {
          result: {
            nodeId: planned.node.id,
            [kind === 'door' ? 'doorId' : 'windowId']: planned.node.id,
            localX: planned.localX, t: planned.t, clamped: planned.clamped,
            ...(kind === 'window' ? { sillHeight: planned.sillHeight } : {}),
          },
          changes: { create: [{ node: planned.node, parentId: planned.wallId }] },
        }
      }
      break
    }
    case 'edit_collection':
      outcome = editCollection({ nodes, collections: state.collections }, args)
      break
    case 'list_collections':
      outcome = listCollections({ nodes, collections: state.collections }, args)
      break
    default: {
      if (name === 'delete_node') {
        const node = nodes[args.id as string]
        if (node && !nodeRegistry.get(node.type)?.capabilities.deletable)
          refuse('not_deletable', `The registered ${node.type} kind does not allow deletion.`)
      }
      const operation = AGENT_OPERATIONS[name as keyof typeof AGENT_OPERATIONS]
      outcome = operation(nodes, args as never, context)
    }
  }
  assertWritable()
  if (!outcome.changes) return { result: outcome.result }
  const log = confirmGhostPreview([{ type: 'shared_agent', toolName: name, status: 'valid', outcome, compiled: compiledOutput }])
  return { result: outcome.result, log }
}

export async function executeSharedAgentToolCalls({
  calls,
  messageId,
  signal,
}: {
  calls: readonly SharedAgentToolCall[]
  messageId: string | null
  signal?: AbortSignal
}): Promise<ToolResult> {
  const results: Record<string, unknown>[] = []
  const errors: string[] = []
  const operations: ValidatedSharedAgentOperation[] = []
  for (const call of calls) {
    try {
      const { result, log } = await runSharedAgentTool({ name: call.tool, input: call.sharedInput, signal })
      results.push({ toolName: call.tool, ...result })
      if (log && messageId) {
        log.messageId = messageId
        const store = useAIChat.getState()
        operations.push(...log.operations as ValidatedSharedAgentOperation[])
        store.setOperations(messageId, [...operations])
        store.confirmOperations(messageId)
        store.addOperationLog(log)
      }
    } catch (error) {
      if (signal?.aborted) throw error
      const reason = error instanceof Error ? error.message : String(error)
      errors.push(`${call.tool}: ${reason}`)
      results.push({ toolName: call.tool, ...(isAgentRefusal(error) ? refusalPayload(error) : { error: reason }) })
    }
  }
  return {
    toolName: calls.map((call) => call.tool).join('+'),
    success: errors.length === 0,
    summary: `${calls.length - errors.length} shared tools succeeded; ${errors.length} failed.`,
    details: { validCount: calls.length - errors.length, adjustedCount: 0, invalidCount: errors.length, adjustments: [], errors, results },
  }
}
