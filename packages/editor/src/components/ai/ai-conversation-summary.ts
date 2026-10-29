import { AI_INPUT_LIMITS, extractChatMessageText, type ChatMessageInput } from './contracts/chat-request'
import { getAIRuntime } from './runtime'

/** Split by UTF-16 length without separating the halves of a Unicode character. */
function splitText(text: string): string[] {
  const chunks: string[] = []
  let offset = 0
  while (offset < text.length) {
    let end = Math.min(offset + 900, text.length)
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1]!) && /[\uDC00-\uDFFF]/.test(text[end]!)) end--
    chunks.push(text.slice(offset, end))
    offset = end
  }
  return chunks.length ? chunks : ['']
}

/** Summarize in bounded batches, carrying each preceding summary forward. */
export async function summarizeConversation({ messages, signal }: {
  messages: Pick<ChatMessageInput, 'role' | 'content'>[]
  signal: AbortSignal
}): Promise<string | null> {
  const parts = messages.flatMap(message => {
    const text = extractChatMessageText(message.content)
    return splitText(text).map(content => ({ role: message.role, content }))
  })
  let summary: string | null = null
  let offset = 0
  let calls = 0
  while (offset < parts.length) {
    if (++calls > 20) return null
    const previous = summary ? splitText(summary).map((content, index) => ({
      role: 'user' as const, content: `[Previous summary part ${index + 1}] ${content}`,
    })) : []
    // The server may expand omitted JSON blocks before applying its per-message
    // limit. Bound each formatted line conservatively below its 48k total cap.
    const cost = (content: string) => Math.min(2012, content.length * 2 + 20) + 16
    let characters = previous.reduce((total, message) => total + cost(message.content), 0)
    if (previous.length >= AI_INPUT_LIMITS.MAX_MESSAGES || characters >= 42_000) return null
    const batch: typeof parts = []
    while (offset < parts.length && previous.length + batch.length < AI_INPUT_LIMITS.MAX_MESSAGES) {
      const part = parts[offset]!
      const next = cost(part.content)
      if (characters + next > 42_000) break
      batch.push(part)
      characters += next
      offset++
    }
    if (!batch.length) return null
    const result = await getAIRuntime().transport.summarize([...previous, ...batch], signal)
    if (signal.aborted) throw new DOMException('Agent loop aborted', 'AbortError')
    if (!result?.summary) return null
    summary = result.summary
  }
  return summary
}
