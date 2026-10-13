import { nanoid } from 'nanoid'
import type { AnyNodeId } from '@aedifex/core'
import { useScene } from '@aedifex/core'
import { useViewer } from '@aedifex/viewer'
import { useAIChat } from './ai-chat-store'
import { validateToolCall } from './ai-mutation-executor'
import { invalidateSceneCache } from './ai-scene-serializer'
import { getAIRuntime, getRoomPresetProvider } from './runtime'
import type {
  AIToolCall,
  InsertRoomPresetToolCall,
  SaveRoomPresetToolCall,
  ToolResult,
  ValidatedInsertRoomPreset,
  ValidatedOperation,
  ValidatedSaveRoomPreset,
} from './types'

// ============================================================================
// Room Preset Executor
//
// save_room_preset / insert_room_preset are HOST-ASYNC actions, not scene
// mutations: the actual work (serialize zone → storage, instantiate preset →
// createNodes) happens inside the RoomPresetProvider injected via AIRuntime.
// They therefore bypass the ghost preview / confirmGhostPreview pipeline
// (which is synchronous and snapshot-based) and run through this dedicated
// executor invoked by the agent loop. The contract with the loop:
//
//   1. The returned ToolResult is fed back to the LLM as a tool message so
//      success/failure wording (quota messages etc.) reaches the user.
//   2. A successful insert records an AIOperationLog whose createdNodeIds
//      are the provider-returned rootIds — the existing undo path
//      (undoConfirmedOperation) cascade-deletes them.
//   3. A successful insert selects the inserted nodes in the viewer.
// ============================================================================

export const ROOM_PRESET_TOOLS = new Set(['save_room_preset', 'insert_room_preset'])

export function isRoomPresetToolCall(
  toolCall: AIToolCall,
): toolCall is SaveRoomPresetToolCall | InsertRoomPresetToolCall {
  return ROOM_PRESET_TOOLS.has(toolCall.tool)
}

interface PresetExecutionOutcome {
  operation: ValidatedOperation
  success: boolean
  /** One-line LLM-facing description of what happened. */
  detail: string
  createdNodeIds: AnyNodeId[]
}

async function executeSave(op: ValidatedSaveRoomPreset): Promise<PresetExecutionOutcome> {
  const result = await getRoomPresetProvider().save(op.zoneId, op.zoneName)
  if (result.ok) {
    return {
      operation: op,
      success: true,
      detail: `Room "${op.zoneName}" was saved as preset${result.presetId ? ` (id: ${result.presetId})` : ''}.${result.message ? ` ${result.message}` : ''}`,
      createdNodeIds: [],
    }
  }
  return {
    operation: op,
    success: false,
    detail: `Saving room "${op.zoneName}" as a preset failed: ${result.message ?? 'unknown error'}`,
    createdNodeIds: [],
  }
}

async function executeInsert(op: ValidatedInsertRoomPreset): Promise<PresetExecutionOutcome> {
  const result = await getRoomPresetProvider().insert(op.presetId, {
    levelId: op.levelId,
    position: op.position,
  })
  if (result.ok) {
    const rootIds = (result.rootIds ?? []) as AnyNodeId[]
    // Keep only ids that actually landed in the scene store — defensive
    // against a provider returning ids it failed to create.
    const liveNodes = useScene.getState().nodes
    const createdNodeIds = rootIds.filter((id) => Boolean(liveNodes[id]))
    // Zero ids landing despite a provider "ok" means the scene rejected or
    // reverted the write (e.g. a save-conflict reload raced the insert).
    // Reporting success here would make the LLM tell the user the room is
    // there while the viewport shows nothing — fail loudly instead.
    if (rootIds.length > 0 && createdNodeIds.length === 0) {
      return {
        operation: op,
        success: false,
        detail: `Inserting preset "${op.presetName}" failed: the host reported success but none of the created nodes are present in the scene (a concurrent reload may have reverted it). Tell the user the insert did not take effect and suggest trying again.`,
        createdNodeIds: [],
      }
    }
    return {
      operation: op,
      success: true,
      detail: `Preset "${op.presetName}" was inserted at [${op.position.join(', ')}] on level ${op.levelId}.${result.message ? ` ${result.message}` : ''}`,
      createdNodeIds,
    }
  }
  return {
    operation: op,
    success: false,
    detail: `Inserting preset "${op.presetName}" failed: ${result.message ?? 'unknown error'}`,
    createdNodeIds: [],
  }
}

/**
 * Validate + execute a batch of room-preset tool calls.
 *
 * Invalid calls are NOT sent to the provider — their errorReason goes
 * straight into the ToolResult so the LLM can recover (ask the user,
 * pick another name). Valid calls run sequentially (a save followed by
 * an insert in one response must observe the save).
 */
export async function executeRoomPresetToolCalls(
  toolCalls: (SaveRoomPresetToolCall | InsertRoomPresetToolCall)[],
  messageId: string | null,
): Promise<ToolResult> {
  const outcomes: PresetExecutionOutcome[] = []

  const telemetry = getAIRuntime().telemetry

  for (const call of toolCalls) {
    const [validated] = validateToolCall(call)
    if (!validated) continue
    telemetry?.toolValidated?.({ tool: validated.type, status: validated.status })

    if (validated.status === 'invalid') {
      const reason = 'errorReason' in validated ? validated.errorReason : undefined
      outcomes.push({
        operation: validated,
        success: false,
        detail: `${validated.type}: ${reason ?? 'validation failed'}`,
        createdNodeIds: [],
      })
      continue
    }

    if (validated.type === 'save_room_preset') {
      outcomes.push(await executeSave(validated))
    } else if (validated.type === 'insert_room_preset') {
      outcomes.push(await executeInsert(validated))
    }
  }

  const operations = outcomes.map((o) => o.operation)
  const allCreatedIds = outcomes.flatMap((o) => o.createdNodeIds)

  // Record message operations so the chat UI shows the op chip, and an
  // operation log for successful inserts so undo can remove the rootIds.
  if (messageId) {
    const store = useAIChat.getState()
    store.setOperations(messageId, operations)
    const anySuccess = outcomes.some((o) => o.success)
    if (anySuccess) {
      store.confirmOperations(messageId)
    } else {
      store.rejectOperations(messageId)
    }
  }

  if (allCreatedIds.length > 0) {
    invalidateSceneCache()
    if (messageId) {
      useAIChat.getState().addOperationLog({
        id: nanoid(),
        messageId,
        timestamp: Date.now(),
        operations,
        status: 'confirmed',
        affectedNodeIds: allCreatedIds,
        createdNodeIds: allCreatedIds,
        previousSnapshot: {},
        removedNodes: [],
      })
    }
    // Auto-select the inserted nodes so the user immediately sees what landed.
    useViewer.getState().setSelection({ selectedIds: allCreatedIds })
  }

  const successCount = outcomes.filter((o) => o.success).length
  const failureCount = outcomes.length - successCount
  const parts: string[] = []
  if (successCount > 0) parts.push(`${successCount} succeeded`)
  if (failureCount > 0) parts.push(`${failureCount} failed`)

  return {
    toolName: toolCalls.map((tc) => tc.tool).join('+'),
    success: failureCount === 0 && outcomes.length > 0,
    summary: `Executed ${outcomes.length} room preset operations: ${parts.join(', ') || 'none'}. ${outcomes.map((o) => o.detail).join(' ')}`.trim(),
    details: {
      validCount: successCount,
      adjustedCount: 0,
      invalidCount: failureCount,
      adjustments: [],
      errors: outcomes.filter((o) => !o.success).map((o) => o.detail),
      createdNodeIds: allCreatedIds,
      removedNodeIds: [],
    },
  }
}
