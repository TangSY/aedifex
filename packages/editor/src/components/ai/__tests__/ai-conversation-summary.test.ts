import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessageInput } from '../contracts/chat-request'

const summarize = vi.hoisted(() => vi.fn())
vi.mock('../runtime', () => ({ getAIRuntime: () => ({ transport: { summarize } }) }))
import { summarizeConversation } from '../ai-conversation-summary'

type Message = Pick<ChatMessageInput, 'role' | 'content'>

function clean(content: string): string {
  return content.replace(/```json[\s\S]*?```/g, '[tool calls omitted]')
    .replace(/\[{"tool"[\s\S]*?}\]/g, '[tool calls omitted]')
}

function assertSafe(messages: Message[]) {
  expect(messages.length).toBeLessThanOrEqual(100)
  const lines = messages.map(({ role, content }) => {
    expect(typeof content).toBe('string')
    const cleaned = clean(content as string)
    expect(cleaned.length).toBeLessThanOrEqual(2000)
    return `${role === 'user' ? 'User' : 'Assistant'}: ${cleaned}`
  })
  expect(lines.join('\n\n').length).toBeLessThanOrEqual(48_000)
}

describe('summarizeConversation', () => {
  beforeEach(() => summarize.mockReset())

  it('retains every part of a long conversation and a long previous summary within server limits', async () => {
    const previous = 'summary-prefix-' + 's'.repeat(2500) + '-summary-suffix'
    summarize.mockResolvedValue({ summary: previous })
    const input: Message[] = Array.from({ length: 100 }, (_, index) => ({
      role: index % 2 ? 'assistant' : 'user',
      content: `${String(index).padStart(3, '0')}:` + 'x'.repeat(1996),
    }))
    const result = await summarizeConversation({ messages: input, signal: new AbortController().signal })
    expect(result).toBe(previous)
    expect(summarize.mock.calls.length).toBeGreaterThan(1)
    const chunks: string[] = []
    for (const [messages] of summarize.mock.calls as [Message[], AbortSignal][]) {
      assertSafe(messages)
      const carried = messages.filter(message => (message.content as string).startsWith('[Previous summary part '))
      if (chunks.length) {
        expect(carried.map(message => (message.content as string).replace(/^\[Previous summary part \d+\] /, '')).join('')).toBe(previous)
      }
      chunks.push(...messages.slice(carried.length).map(message => message.content as string))
    }
    expect(chunks.join('')).toBe(input.map(message => message.content).join(''))
  })

  it('accounts for cleaning expansion and refuses input that exceeds the call budget', async () => {
    summarize.mockResolvedValue({ summary: 'short' })
    const input: Message[] = Array.from({ length: 700 }, () => ({ role: 'user', content: '```json```'.repeat(200) }))
    const result = await summarizeConversation({ messages: input, signal: new AbortController().signal })
    expect(result).toBeNull()
    expect(summarize).toHaveBeenCalledTimes(20)
    for (const [messages] of summarize.mock.calls as [Message[], AbortSignal][]) assertSafe(messages)
  })

  it('fails safely if the previous summary cannot fit alongside a new message', async () => {
    summarize.mockResolvedValue({ summary: 's'.repeat(100_000) })
    const input: Message[] = Array.from({ length: 101 }, () => ({ role: 'user', content: 'x' }))
    expect(await summarizeConversation({ messages: input, signal: new AbortController().signal })).toBeNull()
    expect(summarize).toHaveBeenCalledTimes(1)
  })

  it('does not split a Unicode character across messages or previous summary parts', async () => {
    const previous = 'p'.repeat(899) + '😀' + 'q'.repeat(1100)
    summarize.mockResolvedValue({ summary: previous })
    const text = 'a'.repeat(899) + '😀' + 'b'.repeat(1000)
    const input: Message[] = Array.from({ length: 50 }, () => ({ role: 'user', content: text }))
    await summarizeConversation({ messages: input, signal: new AbortController().signal })
    expect(summarize.mock.calls.length).toBeGreaterThan(1)
    for (const [messages] of summarize.mock.calls as [Message[], AbortSignal][]) {
      for (const message of messages) {
        expect(message.content as string).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/)
      }
    }
  })
})
