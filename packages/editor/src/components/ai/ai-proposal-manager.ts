import {
  type AnyNode,
  type AnyNodeId,
  ItemNode,
  useScene,
} from '@aedifex/core'
import { useViewer } from '@aedifex/viewer'
import { nanoid } from 'nanoid'
import { useAIChat } from './ai-chat-store'
import type { Proposal, ValidatedOperation } from './types'

// ============================================================================
// Proposal Manager
// Manages multiple AI design proposals with independent scene snapshots.
// Bypasses Zundo — manages own snapshots, applies delta updates on switch.
//
// Design decision: does NOT create multiple Zustand store instances.
// Instead, stores node snapshots per proposal and applies/reverts deltas
// when switching between proposals.
// ============================================================================

/** Snapshot of the scene before any proposal was applied */
let baselineSnapshot: Record<AnyNodeId, AnyNode> | null = null

/** IDs of nodes created by each proposal (for cleanup on switch) */
const proposalCreatedNodes = new Map<string, AnyNodeId[]>()

/** Original states of nodes modified by each proposal (for restore on switch) */
const proposalModifiedNodes = new Map<string, Map<AnyNodeId, AnyNode>>()

/** IDs of nodes removed by each proposal (for restore on switch) */
const proposalRemovedNodes = new Map<string, Map<AnyNodeId, { node: AnyNode; parentId: string }>>()

/** Currently applied proposal ID */
let appliedProposalId: string | null = null

// ============================================================================
// Public API
// ============================================================================

/**
 * Create proposals from AI operations.
 * Each set of operations becomes a separate proposal (A, B, C).
 */
export function createProposals(
  operationSets: { label: string; operations: ValidatedOperation[] }[],
): Proposal[] {
  // Save baseline scene state before any proposal is applied
  const { nodes } = useScene.getState()
  baselineSnapshot = { ...nodes }
  appliedProposalId = null

  // Reset tracking state
  proposalCreatedNodes.clear()
  proposalModifiedNodes.clear()
  proposalRemovedNodes.clear()

  const proposals: Proposal[] = operationSets.map((set, index) => {
    const id = nanoid()
    const label = set.label || `方案 ${String.fromCharCode(65 + index)}`

    proposalCreatedNodes.set(id, [])
    proposalModifiedNodes.set(id, new Map())
    proposalRemovedNodes.set(id, new Map())

    return {
      id,
      label,
      operations: set.operations,
      nodeSnapshot: {}, // Populated when proposal is first applied
      userAdjustments: [],
    }
  })

  // Store proposals in chat store
  useAIChat.getState().setProposals(proposals)

  // Apply the first proposal by default
  if (proposals.length > 0 && proposals[0]) {
    switchToProposal(proposals[0].id)
  }

  return proposals
}

/**
 * Switch to a different proposal — reverts current, applies new.
 */
export function switchToProposal(proposalId: string): void {
  const { proposals } = useAIChat.getState()
  const proposal = proposals.find((p) => p.id === proposalId)
  if (!proposal || !baselineSnapshot) return

  // Pause undo tracking during proposal switching
  useScene.temporal.getState().pause()

  try {
    // Revert current proposal if one is applied
    if (appliedProposalId && appliedProposalId !== proposalId) {
      revertProposal(appliedProposalId)
    }

    // Apply the new proposal
    applyProposal(proposal)
    appliedProposalId = proposalId

    // Update active proposal in store
    useAIChat.getState().setActiveProposal(proposalId)
  } finally {
    useScene.temporal.getState().resume()
  }
}

/**
 * Confirm the active proposal — make its changes permanent.
 */
export function confirmActiveProposal(): ValidatedOperation[] | null {
  const { activeProposalId, proposals } = useAIChat.getState()
  if (!activeProposalId || !baselineSnapshot) return null

  const proposal = proposals.find((p) => p.id === activeProposalId)
  if (!proposal) return null

  // Resume undo tracking — changes from here are tracked
  useScene.temporal.getState().resume()

  // The current scene state already has the proposal applied.
  // We need to create a proper undoable batch:
  // 1. Revert to baseline (paused)
  // 2. Resume undo
  // 3. Apply proposal operations as tracked changes

  useScene.temporal.getState().pause()
  revertProposal(activeProposalId)
  useScene.temporal.getState().resume()

  // Now apply the operations as tracked changes
  const levelId = useViewer.getState().selection.levelId
  for (const op of proposal.operations) {
    if (op.status === 'invalid') continue

    switch (op.type) {
      case 'add_item': {
        const node = ItemNode.parse({
          name: op.asset.name,
          asset: op.asset,
          position: op.position,
          rotation: op.rotation,
        })
        useScene.getState().createNode(node, levelId as AnyNodeId)
        break
      }
      case 'remove_item': {
        useScene.getState().deleteNode(op.nodeId)
        break
      }
      case 'move_item': {
        useScene.getState().updateNode(op.nodeId, {
          position: op.position,
          rotation: op.rotation,
        })
        break
      }
      case 'update_material': {
        // Material update — schema-dependent
        break
      }
    }
  }

  // Clean up
  clearProposalState()
  useAIChat.getState().clearProposals()

  return proposal.operations
}

/**
 * Reject all proposals — restore baseline state.
 */
export function rejectAllProposals(): void {
  if (!baselineSnapshot) return

  useScene.temporal.getState().pause()

  if (appliedProposalId) {
    revertProposal(appliedProposalId)
  }

  useScene.temporal.getState().resume()
  clearProposalState()
  useAIChat.getState().clearProposals()
}

/**
 * Check if proposal mode is active.
 */
export function isProposalModeActive(): boolean {
  return baselineSnapshot !== null
}

/**
 * Reset all module-level proposal state.
 * Call this when the AI chat panel unmounts or the scene is fully reset.
 */
export function cleanupProposalManager(): void {
  baselineSnapshot = null
  proposalCreatedNodes.clear()
  proposalModifiedNodes.clear()
  proposalRemovedNodes.clear()
}

// ============================================================================
// Internal Helpers
// ============================================================================

function applyProposal(proposal: Proposal): void {
  const { nodes } = useScene.getState()
  const levelId = useViewer.getState().selection.levelId
  if (!levelId) return

  const createdIds: AnyNodeId[] = []
  const modifiedStates = new Map<AnyNodeId, AnyNode>()
  const removedStates = new Map<AnyNodeId, { node: AnyNode; parentId: string }>()

  for (const op of proposal.operations) {
    if (op.status === 'invalid') continue

    switch (op.type) {
      case 'add_item': {
        const node = ItemNode.parse({
          name: op.asset.name,
          asset: op.asset,
          position: op.position,
          rotation: op.rotation,
          metadata: { isTransient: true, isGhostPreview: true },
        })
        useScene.getState().createNode(node, levelId as AnyNodeId)
        createdIds.push(node.id as AnyNodeId)
        break
      }
      case 'remove_item': {
        const node = nodes[op.nodeId]
        if (node) {
          removedStates.set(op.nodeId, {
            node: { ...node },
            parentId: (node.parentId as string) ?? '',
          })
          useScene.getState().updateNode(op.nodeId, { visible: false })
        }
        break
      }
      case 'move_item': {
        const node = nodes[op.nodeId]
        if (node && 'position' in node) {
          modifiedStates.set(op.nodeId, { ...node })
          useScene.getState().updateNode(op.nodeId, {
            position: op.position,
            rotation: op.rotation,
          })
        }
        break
      }
      case 'update_material': {
        const node = nodes[op.nodeId]
        if (node) {
          modifiedStates.set(op.nodeId, { ...node })
        }
        break
      }
    }
  }

  proposalCreatedNodes.set(proposal.id, createdIds)
  proposalModifiedNodes.set(proposal.id, modifiedStates)
  proposalRemovedNodes.set(proposal.id, removedStates)
}

function revertProposal(proposalId: string): void {
  // Delete created nodes
  const createdIds = proposalCreatedNodes.get(proposalId) ?? []
  for (const id of createdIds) {
    useScene.getState().deleteNode(id)
  }

  // Restore modified nodes
  const modifiedStates = proposalModifiedNodes.get(proposalId)
  if (modifiedStates) {
    for (const [nodeId, originalState] of modifiedStates) {
      if ('position' in originalState) {
        useScene.getState().updateNode(nodeId, {
          position: originalState.position as [number, number, number],
          rotation: originalState.rotation as [number, number, number],
        })
      }
    }
  }

  // Restore removed nodes (make visible again)
  const removedStates = proposalRemovedNodes.get(proposalId)
  if (removedStates) {
    for (const [nodeId] of removedStates) {
      useScene.getState().updateNode(nodeId, { visible: true })
    }
  }
}

function clearProposalState(): void {
  baselineSnapshot = null
  appliedProposalId = null
  proposalCreatedNodes.clear()
  proposalModifiedNodes.clear()
  proposalRemovedNodes.clear()
}
