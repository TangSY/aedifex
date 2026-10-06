'use client'

import { Check, MapPin, X } from 'lucide-react'
import { motion } from 'motion/react'
import { cn } from '../../../lib/utils'
import type { ChatMessage, PlacementOption, Proposal, ProposePlacementToolCall } from '../types'

// ============================================================================
// Placement Proposal Cards (propose_placement tool)
// ============================================================================

export function PlacementProposalCards({
  message,
  onSelectOption,
}: {
  message: ChatMessage
  onSelectOption: (option: PlacementOption) => void
}) {
  const proposalCall = message.toolCalls?.find(
    (tc) => tc.tool === 'propose_placement',
  ) as ProposePlacementToolCall | undefined
  if (!proposalCall) return null

  return (
    <div className="mt-2 border-border/30 border-t pt-2">
      <p className="mb-1.5 font-barlow font-medium text-xs">{proposalCall.question}</p>
      <div className="flex flex-col gap-1.5">
        {proposalCall.options.map((option) => (
          <button
            className="group flex items-start gap-2 rounded-lg border border-border/50 bg-accent/20 px-2.5 py-2 text-left transition-all hover:border-sidebar-primary/50 hover:bg-sidebar-primary/10"
            key={option.id}
            onClick={() => onSelectOption(option)}
            type="button"
          >
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/20 font-barlow font-semibold text-[10px] text-sidebar-primary">
              {option.id.replace(/\D/g, '') || option.id.charAt(option.id.length - 1)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-barlow font-medium text-xs">{option.label}</p>
              <p className="mt-0.5 font-barlow text-[10px] text-muted-foreground leading-relaxed">
                {option.reason}
              </p>
            </div>
            <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-sidebar-primary" />
          </button>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// Proposal Tabs (Multi-proposal A/B/C comparison)
// ============================================================================

export function ProposalTabs({
  proposals,
  activeProposalId,
  onSwitch,
  onConfirm,
  onReject,
}: {
  proposals: Proposal[]
  activeProposalId: string | null
  onSwitch: (proposalId: string) => void
  onConfirm: () => void
  onReject: () => void
}) {
  return (
    <motion.div
      animate={{ height: 'auto', opacity: 1 }}
      className="overflow-hidden border-border/50 border-b bg-sidebar-primary/5"
      initial={{ height: 0, opacity: 0 }}
    >
      <div className="px-3 py-2.5">
        {/* Proposal tabs */}
        <div className="mb-2 flex items-center gap-1">
          {proposals.map((proposal) => {
            const isActive = proposal.id === activeProposalId
            return (
              <button
                className={cn(
                  'flex-1 rounded-md px-2 py-1.5 font-barlow text-xs transition-all',
                  isActive
                    ? 'bg-sidebar-primary text-white'
                    : 'bg-accent/30 text-muted-foreground hover:bg-accent/60',
                )}
                key={proposal.id}
                onClick={() => onSwitch(proposal.id)}
                type="button"
              >
                {proposal.label}
              </button>
            )
          })}
        </div>

        {/* Active proposal operation count */}
        {activeProposalId && (
          <div className="mb-2">
            {proposals
              .filter((p) => p.id === activeProposalId)
              .map((p) => {
                const validOps = p.operations.filter((op) => op.status !== 'invalid')
                return (
                  <span className="font-barlow text-[11px] text-muted-foreground" key={p.id}>
                    {validOps.length} operation{validOps.length !== 1 ? 's' : ''} · Switch tabs to preview different options
                  </span>
                )
              })}
          </div>
        )}

        {/* Confirm / Reject buttons */}
        <div className="flex items-center justify-end gap-1.5">
          <button
            className="flex h-7 items-center gap-1 rounded-md bg-destructive/20 px-2.5 font-barlow text-destructive text-xs transition-colors hover:bg-destructive/30"
            onClick={onReject}
            type="button"
          >
            <X className="h-3.5 w-3.5" />
            Reject all
          </button>
          <button
            className="flex h-7 items-center gap-1 rounded-md bg-sidebar-primary px-2.5 font-barlow text-white text-xs transition-colors hover:bg-sidebar-primary/90"
            onClick={onConfirm}
            type="button"
          >
            <Check className="h-3.5 w-3.5" />
            Confirm selection
          </button>
        </div>
      </div>
    </motion.div>
  )
}
