import { streamChat as legacyStreamChat } from '../ai-stream-client'
import type {
  ChatTransport,
  StreamCallbacks,
} from '../contracts/runtime'
import type { ChatRequestBody, ChatMessageInput } from '../contracts/chat-request'

/**
 * Default ChatTransport for OSS deployments.
 *
 * Sends `POST /api/ai/chat` and `POST /api/ai/summarize` with no
 * credentials/headers. The endpoint paths are configurable so a
 * standalone OSS deployment can route to a self-hosted LLM gateway
 * without re-implementing the SSE parser.
 *
 * SaaS implements its own ChatTransport with auth cookies + retry
 * wrapper; it does NOT extend this class.
 */
export interface DefaultTransportOptions {
  /** Defaults to '/api/ai/chat' (legacy streamChat hardcodes this) */
  chatEndpoint?: string
  /** Defaults to '/api/ai/summarize' */
  summarizeEndpoint?: string
}

export function createDefaultChatTransport(
  options: DefaultTransportOptions = {},
): ChatTransport {
  // chatEndpoint is currently unused — legacy streamChat hardcodes
  // '/api/ai/chat'. Kept in the API surface so a future refactor can
  // wire it without changing the contract.
  void options.chatEndpoint

  const summarizeEndpoint = options.summarizeEndpoint ?? '/api/ai/summarize'

  return {
    streamChat(
      request: ChatRequestBody,
      callbacks: StreamCallbacks,
      signal: AbortSignal,
    ): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        if (signal.aborted) {
          reject(new DOMException('Stream aborted', 'AbortError'))
          return
        }

        let settled = false
        const settle = (err?: Error) => {
          if (settled) return
          settled = true
          if (err) reject(err)
          else resolve()
        }

        const controller = legacyStreamChat(request, {
          onTextChunk: callbacks.onTextChunk,
          onToolCall: callbacks.onToolCall,
          onComplete: (fullText, toolCalls, toolCallIds, usage) => {
            callbacks.onComplete(fullText, toolCalls, toolCallIds, usage)
            settle()
          },
          onError: (error) => {
            // Default transport has no error metadata — SaaS overrides this.
            callbacks.onError(error)
            settle()
          },
          onRetry: callbacks.onRetry,
        })

        // Bridge external abort signal to the controller returned by
        // legacyStreamChat. The controller is what processStreamWithRetry
        // actually checks via signal.aborted internally.
        const onAbort = () => {
          controller.abort()
          settle(new DOMException('Stream aborted', 'AbortError'))
        }
        if (signal.aborted) {
          onAbort()
        } else {
          signal.addEventListener('abort', onAbort, { once: true })
        }
      })
    },

    async summarize(
      messages: Pick<ChatMessageInput, 'role' | 'content'>[],
      signal: AbortSignal,
    ): Promise<{ summary: string } | null> {
      try {
        const response = await fetch(summarizeEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages }),
          signal,
        })

        if (!response.ok) return null

        const data = (await response.json()) as { summary?: string }
        if (!data.summary) return null

        return { summary: data.summary }
      } catch {
        // Network error / abort — caller falls back to simple truncation
        return null
      }
    },
  }
}
