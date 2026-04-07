'use client'

import { Bot } from 'lucide-react'
import { AIMarkdown } from '../ai-markdown'
import { memo } from 'react'
import { cn } from '../../../lib/utils'
import { useAIChat } from '../ai-chat-store'
import type { ChatMessage } from '../types'
import { BeforeAfterComparison, OperationSummary } from './operation-cards'
import { PlacementProposalCards } from './proposal-cards'

// ============================================================================
// Message Bubble
// ============================================================================

export const MessageBubble = memo(function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const hasContent = message.content.trim().length > 0
  const hasOperations = message.operations && message.operations.length > 0
  const hasProposal = message.toolCalls?.some((tc) => tc.tool === 'propose_placement')
  const askUserCall = message.toolCalls?.find((tc) => tc.tool === 'ask_user') as
    | { tool: 'ask_user'; question: string; suggestions?: string[] }
    | undefined
  // Only show ask_user history card when the question has been answered
  // (pendingQuestion is null). While pending, PendingQuestionCard handles it.
  const pendingQuestion = useAIChat((s) => s.pendingQuestion)
  const showAskUserHistory = askUserCall && !pendingQuestion
  const hasScreenshots = message.screenshotBefore && message.screenshotAfter

  // Skip rendering truly empty assistant bubbles (no content, no tool calls, nothing)
  if (!isUser && !hasContent && !hasOperations && !hasProposal && !showAskUserHistory && !hasScreenshots) {
    return null
  }

  return (
    <div className={cn('flex gap-2', isUser && 'flex-row-reverse')}>
      {!isUser && (
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/20">
          <Bot className="h-3.5 w-3.5 text-sidebar-primary" />
        </div>
      )}
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-3 py-2 font-barlow text-sm',
          isUser ? 'bg-sidebar-primary text-white' : 'bg-accent/30',
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : hasContent ? (
          <AIMarkdown content={message.content} />
        ) : null}

        {/* ask_user question preserved in message history (read-only, already answered) */}
        {showAskUserHistory && (
          <div className={cn('rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-3 py-2', hasContent && 'mt-2')}>
            <p className="font-barlow text-sm">{askUserCall.question}</p>
            {askUserCall.suggestions && askUserCall.suggestions.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {askUserCall.suggestions.map((s) => (
                  <span
                    className="rounded-md border border-border/30 bg-accent/20 px-2 py-0.5 font-barlow text-[11px] text-muted-foreground"
                    key={s}
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Placement proposal options — hide after user selects one */}
        {hasProposal &&
          message.operationStatus !== 'confirmed' &&
          message.operationStatus !== 'rejected' && (
          <PlacementProposalCards
            message={message}
            onSelectOption={(option) => {
              const text = `I choose option ${option.id}: ${option.label}`
              window.dispatchEvent(new CustomEvent('ai-select-option', { detail: text }))
            }}
          />
        )}

        {/* Operation summary */}
        {message.operations && message.operations.length > 0 && (
          <div className="mt-2 border-border/30 border-t pt-2">
            <OperationSummary
              messageId={message.id}
              operations={message.operations}
              status={message.operationStatus}
            />
          </div>
        )}

        {/* Before/After thumbnails with click-to-enlarge */}
        {message.screenshotBefore && message.screenshotAfter && (
          <BeforeAfterComparison
            after={message.screenshotAfter}
            before={message.screenshotBefore}
          />
        )}
      </div>
    </div>
  )
})
