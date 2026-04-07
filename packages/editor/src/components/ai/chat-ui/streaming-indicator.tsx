'use client'

import { Bot, Loader2 } from 'lucide-react'
import { AIMarkdown } from '../ai-markdown'
import { memo, useEffect, useRef } from 'react'
import { useAIChat } from '../ai-chat-store'

// ============================================================================
// A-P1: StreamingIndicator — subscribes only to streamingContent + isStreaming
// High-frequency streaming updates (dozens/sec) are isolated here so the rest
// of the panel does not re-render on every incoming chunk.
// ============================================================================

export const StreamingIndicator = memo(function StreamingIndicator({
  messagesEndRef,
}: {
  messagesEndRef: React.RefObject<HTMLDivElement | null>
}) {
  const isStreaming = useAIChat((s) => s.isStreaming)
  const streamingContent = useAIChat((s) => s.streamingContent)
  const iterationCount = useAIChat((s) => s.iterationCount)

  // Scroll to bottom whenever streaming content updates (throttled via rAF)
  const scrollRafRef = useRef(0)
  useEffect(() => {
    if (!isStreaming) return
    if (scrollRafRef.current) return // already scheduled
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = 0
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    })
  }, [streamingContent, isStreaming, messagesEndRef])

  if (!isStreaming) return null

  return (
    <div className="flex gap-2">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/20">
        <Bot className="h-3.5 w-3.5 text-sidebar-primary" />
      </div>
      <div className="flex-1 rounded-lg bg-accent/30 px-3 py-2 font-barlow text-sm">
        {streamingContent ? (
          <AIMarkdown content={streamingContent} />
        ) : (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {iterationCount > 1 ? `Iteration ${iterationCount} — Thinking...` : 'Thinking...'}
          </span>
        )}
      </div>
    </div>
  )
})
