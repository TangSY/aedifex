import {
  type AnyNode,
  type CompiledGeometryScript,
  type GeometryArtifactMetadata,
  type GeometryScriptLanguage,
  getArtifactStore,
  metadataRecord,
  nodeRegistry,
  useScene,
} from '@aedifex/core'
import {
  type AddColumnInput,
  type AddObjectInput,
  AGENT_OPERATIONS,
  type AgentContext,
  type AgentOperationOutcome,
  addColumn,
  addObject,
  buildBatchObjects,
  columnScriptParams,
  editCollection,
  editedScriptLanguage,
  listCollections,
  madeEntries,
  readableScript,
  readSourceResult,
  rescriptOpening,
  verifyScene,
} from '@aedifex/core/agent-operations'
import {
  type AuthorScenePayload,
  isAgentRefusal,
  refusalPayload,
  refuse,
} from '@aedifex/core/agent-tools'
import { planWallOpening } from '@aedifex/core/building'
import { compileAuthorScene } from '@aedifex/geometry-script/author-scene'
import { useViewer } from '@aedifex/viewer'
import { z } from 'zod'
import {
  compileAndStoreGeometryScript,
  getGeometryScriptCapabilities,
} from '../../lib/geometry-script/author'
import { useAIChat } from './ai-chat-store'
import { viewAgentScene } from './ai-scene-view'
import type { ChatContentPart } from './contracts/chat-request'
import { type SharedAgentToolName, sharedAgentContracts } from './contracts/shared-agent-tools'
import { confirmGhostPreview } from './preview/confirm-operations'
import { getAIRuntime } from './runtime'
import { sharedAgentSession } from './shared-agent-session'
import type {
  AIOperationLog,
  AIToolCall,
  SharedAgentToolCall,
  ToolResult,
  ValidatedSharedAgentOperation,
} from './types'

export function isSharedAgentToolCall(call: AIToolCall): call is SharedAgentToolCall {
  return 'sharedInput' in call
}

const READ_ONLY_SHARED_TOOLS = new Set<string>([
  'get_source',
  'get_node',
  'list_levels',
  'get_level_summary',
  'get_walls',
  'get_zones',
  'verify_scene',
  'find_by_type',
  'list_collections',
  'measure_stair',
  'search_assets',
  'search_materials',
  'view_scene',
  'get_site',
  'validate_design',
  'view_assets',
  'set_checkpoint',
  'design_brief',
])

export function isSharedAgentMutation(name: SharedAgentToolName): boolean {
  return !READ_ONLY_SHARED_TOOLS.has(name)
}

/** Executes the shared contract once; compiling and storage are the browser host's part. */
export async function runSharedAgentTool({
  name,
  input,
  signal,
  assertSessionCurrent,
}: {
  name: SharedAgentToolName
  input: Record<string, unknown>
  signal?: AbortSignal
  assertSessionCurrent?: () => void
}): Promise<{ result: Record<string, unknown>; log?: AIOperationLog; images?: ChatContentPart[] }> {
  const contract = sharedAgentContracts.get(name)!
  const args = z.object(contract.input).parse(input) as Record<string, unknown>
  const state = useScene.getState()
  const nodes = state.nodes as Record<string, AnyNode>
  const artifacts = getArtifactStore()
  const runtime = getAIRuntime()
  const projectId = useViewer.getState().projectId
  const session = sharedAgentSession()
  const context: AgentContext = {
    session: session.record,
    designBrief: session.record.designBrief,
    activeLevelId: useViewer.getState().selection.levelId,
    materials: state.materials,
    catalog: runtime.catalog.listAssets?.(),
  }
  const assertCurrent = () => {
    assertSessionCurrent?.()
    if (signal?.aborted) throw new DOMException('Agent loop aborted', 'AbortError')
    if (
      useScene.getState().nodes !== nodes ||
      getArtifactStore() !== artifacts ||
      useViewer.getState().projectId !== projectId
    )
      refuse(
        'scene_changed',
        'The scene changed while the tool was running; retry on the current scene.',
      )
  }
  const mutating = isSharedAgentMutation(name)
  const assertWritable = () => {
    assertCurrent()
    if (mutating && useScene.getState().readOnly)
      refuse('read_only', 'This scene is read-only; no changes were made.')
  }
  assertWritable()
  if (name === 'view_scene') return viewAgentScene({ args, signal, assertCurrent })
  if (name === 'clear_scene') {
    if (!runtime.clearScene)
      refuse(
        'clear_scene_unavailable',
        'This host does not provide an explicit reset-and-save path; no changes were made.',
      )
    const result = await runtime.clearScene({
      reason: args.reason as string,
      signal,
      assertCurrent: assertWritable,
    })
    session.reset()
    return { result }
  }
  const compiledOutput: CompiledGeometryScript[] = []
  const compile = async ({
    params = args.params as AddObjectInput['params'],
    source = args,
    kind = name,
  }: {
    params?: AddObjectInput['params']
    source?: Record<string, unknown>
    kind?: SharedAgentToolName
  } = {}) => {
    const previous = source.nodeId ? nodes[source.nodeId as string] : undefined
    const language = editedScriptLanguage(previous, source as { language?: GeometryScriptLanguage })
    if (!getGeometryScriptCapabilities().languages.includes(language))
      refuse(
        'scripts_unavailable',
        `This host cannot execute ${language} scripts; saved source may still be read with get_source.`,
      )
    const compiled = await compileAndStoreGeometryScript({
      code: source.code as string | undefined,
      language: source.language as GeometryScriptLanguage | undefined,
      kind:
        kind === 'add_door'
          ? 'door'
          : kind === 'add_window'
            ? 'window'
            : kind === 'add_column'
              ? 'column'
              : 'item',
      name: source.name as string | undefined,
      description: source.description as string | undefined,
      category: source.category as string | undefined,
      tags: source.tags as string[] | undefined,
      provenance: source.provenance as GeometryArtifactMetadata | undefined,
      nodeId: source.nodeId as string | undefined,
      params,
      assertCurrent: assertWritable,
    })
    assertWritable()
    compiledOutput.push(compiled)
    return compiled
  }

  let outcome: AgentOperationOutcome
  switch (name) {
    case 'get_source': {
      const node = readableScript(nodes, args.nodeId as string, args.face as 'a' | 'b' | undefined)
      const code = await artifacts.text(node.source.script)
      if (code === null) refuse('source_unavailable', 'The stored source could not be read.')
      assertCurrent()
      return { result: readSourceResult(node, code) }
    }
    case 'author_scene': {
      if (args.sceneId && args.sceneId !== projectId)
        refuse('scene_mismatch', 'Open the requested scene before converting it.')
      const authored = await compileAuthorScene(
        nodes,
        {
          payload: args.payload as AuthorScenePayload,
          replace: args.replace as boolean,
          buildingId: args.buildingId as string | undefined,
        },
        context,
        async ({ code, kind, inputs, nodeId }) => {
          assertWritable()
          const built = await compileAndStoreGeometryScript({
            code,
            language: 'three',
            inputs,
            nodeId,
            kind: kind === 'door' || kind === 'window' ? kind : 'item',
            assertCurrent: assertWritable,
          })
          assertWritable()
          const { nodeId: _generatedId, ...artifact } = built
          const result = nodeId ? { ...artifact, nodeId } : artifact
          compiledOutput.push(result)
          return result
        },
        signal,
      )
      assertWritable()
      const provenance: Record<string, string> = {}
      for (const key of ['module', 'adapter'] as const) {
        const text = args[key]
        if (typeof text !== 'string' || !text) continue
        const bytes = new TextEncoder().encode(text)
        const digest = await crypto.subtle.digest('SHA-256', bytes)
        assertWritable()
        const hash = Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, '0'),
        ).join('')
        const stored = await artifacts.put(hash, bytes, 'text/javascript', {
          nodeId: authored.buildingId,
          metadata: { kind: 'item' },
        })
        assertWritable()
        provenance[key] = stored
      }
      const building = authored.changes.update.find((change) => change.id === authored.buildingId)
      if (building && Object.keys(provenance).length) {
        building.data.metadata = {
          ...metadataRecord(building.data.metadata),
          authorSceneSource: provenance,
        }
      }
      outcome = {
        ...authored,
        result: {
          ...authored.result,
          itemTriangles: authored.itemTriangles,
          itemsCompiled: authored.itemsCompiled,
        },
      }
      break
    }
    case 'run_batch': {
      const calls = args.calls as { tool: string; input?: Record<string, unknown> }[]
      for (const call of calls) {
        if (call.tool !== 'delete_node') continue
        const node = nodes[call.input?.id as string]
        if (node && !nodeRegistry.get(node.type)?.capabilities.deletable)
          refuse('not_deletable', `The registered ${node.type} kind does not allow deletion.`)
      }
      const batchObjects = await buildBatchObjects(calls, (input) =>
        compile({
          params: input.params,
          source: input as Record<string, unknown>,
          kind: 'add_object',
        }),
      )
      assertWritable()
      outcome = AGENT_OPERATIONS.run_batch(
        nodes,
        { calls, onRefusal: args.onRefusal as 'stop' | 'skip' | undefined },
        { ...context, batchObjects },
      )
      break
    }
    case 'add_object':
      outcome = addObject(nodes, { ...args, compiled: await compile() } as AddObjectInput, context)
      break
    case 'add_column': {
      const previous = args.nodeId ? nodes[args.nodeId as string] : undefined
      const params = columnScriptParams(previous?.type === 'column' ? previous : undefined, args)
      outcome = addColumn(
        nodes,
        {
          ...args,
          ...(params ? { compiled: await compile({ params }) } : {}),
        } as AddColumnInput,
        context,
      )
      break
    }
    case 'add_door':
    case 'add_window': {
      const kind = name === 'add_door' ? 'door' : 'window'
      if (args.nodeId) {
        const previous = nodes[args.nodeId as string]
        if (previous?.type !== kind)
          refuse(
            'wrong_node_kind',
            `Rebuild a ${kind} with ${name}; this node is ${previous?.type ?? 'missing'}.`,
          )
        outcome = rescriptOpening(
          nodes,
          { nodeId: args.nodeId as string, compiled: await compile() },
          context,
        )
      } else {
        const compiled = args.code ? await compile() : undefined
        const planned = planWallOpening(nodes, { ...args, kind, compiled } as Parameters<
          typeof planWallOpening
        >[1])
        outcome = {
          result: {
            nodeId: planned.node.id,
            [kind === 'door' ? 'doorId' : 'windowId']: planned.node.id,
            localX: planned.localX,
            t: planned.t,
            clamped: planned.clamped,
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
  if (outcome.keep) session.keep(outcome.keep)
  if (!outcome.changes && !outcome.afterReconcile) return { result: outcome.result }
  const log = confirmGhostPreview([
    {
      type: 'shared_agent',
      toolName: name,
      status: 'valid',
      outcome,
      compiled: compiledOutput.length ? compiledOutput : undefined,
    },
  ])
  if (outcome.changes)
    session.keep({ made: madeEntries(useScene.getState().nodes, [outcome.changes]) })
  if (name === 'author_scene')
    outcome.result = {
      ...outcome.result,
      verify: verifyScene(useScene.getState().nodes, undefined, { activeLevelId: null }).result,
    }
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
  const images: ChatContentPart[][] = []
  let sceneChanged = false
  for (const call of calls) {
    try {
      const {
        result,
        log,
        images: rendered,
      } = await runSharedAgentTool({ name: call.tool, input: call.sharedInput, signal })
      if (rendered) images.push(rendered)
      if (log || call.tool === 'clear_scene') sceneChanged = true
      results.push({ toolName: call.tool, ...result })
      if (log && messageId) {
        log.messageId = messageId
        const store = useAIChat.getState()
        operations.push(...(log.operations as ValidatedSharedAgentOperation[]))
        store.setOperations(messageId, [...operations])
        store.confirmOperations(messageId)
        store.addOperationLog(log)
      }
    } catch (error) {
      if (signal?.aborted) throw error
      const reason = error instanceof Error ? error.message : String(error)
      errors.push(`${call.tool}: ${reason}`)
      results.push({
        toolName: call.tool,
        ...(isAgentRefusal(error) ? refusalPayload(error) : { error: reason }),
      })
    }
  }
  return {
    toolName: calls.map((call) => call.tool).join('+'),
    success: errors.length === 0,
    summary: `${calls.length - errors.length} shared tools succeeded; ${errors.length} failed.`,
    details: {
      validCount: calls.length - errors.length,
      adjustedCount: 0,
      invalidCount: errors.length,
      adjustments: [],
      errors,
      results,
      sceneChanged,
      ...(images.length ? { images } : {}),
    },
  }
}
