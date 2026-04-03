import { type NextRequest, NextResponse } from 'next/server'
import { buildSystemPrompt, OPENAI_TOOLS } from '@aedifex/editor/ai/prompt'
import {
  AI_API_KEY,
  AI_CHAT_MAX_TOKENS,
  AI_CHAT_MODEL,
  createAIClient,
} from '../config'

// ============================================================================
// API Route Handler
// ============================================================================

export async function POST(request: NextRequest) {
  if (!AI_API_KEY) {
    return NextResponse.json(
      { error: 'AI service not configured. AI_API_KEY is missing.' },
      { status: 503 },
    )
  }

  let body: { messages: { role: string; content: string; tool_call_id?: string }[]; catalogSummary: string; sceneContext: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { messages, catalogSummary, sceneContext } = body
  if (!messages?.length || !catalogSummary || !sceneContext) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
  }

  // BUG FIX A-4: Input length limits
  const MAX_MESSAGES = 100
  const MAX_MESSAGE_CONTENT_LENGTH = 64 * 1024 // 64K chars per message

  if (messages.length > MAX_MESSAGES) {
    return NextResponse.json(
      { error: `Message count exceeds limit of ${MAX_MESSAGES}.` },
      { status: 400 },
    )
  }

  const oversizedMessage = messages.find((m) => m.content && m.content.length > MAX_MESSAGE_CONTENT_LENGTH)
  if (oversizedMessage) {
    return NextResponse.json(
      { error: 'A message exceeds the maximum content length of 64K characters.' },
      { status: 400 },
    )
  }

  if (catalogSummary.length > 8000) {
    return NextResponse.json({ error: 'catalogSummary exceeds maximum length of 8000 characters.' }, { status: 400 })
  }
  if (sceneContext.length > 16000) {
    return NextResponse.json({ error: 'sceneContext exceeds maximum length of 16000 characters.' }, { status: 400 })
  }

  // BUG FIX A-1: Role whitelist — reject messages with role "system" to prevent prompt injection
  const ALLOWED_ROLES = new Set(['user', 'assistant', 'tool'])
  const invalidMessage = messages.find((m) => !ALLOWED_ROLES.has(m.role))
  if (invalidMessage) {
    return NextResponse.json(
      { error: `Invalid message role: "${invalidMessage.role}". Allowed roles: user, assistant, tool.` },
      { status: 400 },
    )
  }

  const systemPrompt = buildSystemPrompt(catalogSummary, sceneContext)

  // DRY A-D5: Use shared factory function
  const openai = createAIClient()

  try {
    const stream = await openai.chat.completions.create({
      model: AI_CHAT_MODEL,
      max_tokens: AI_CHAT_MAX_TOKENS,
      tools: OPENAI_TOOLS,
      stream: true,
      messages: [
        { role: 'system' as const, content: systemPrompt },
        ...messages.map((m) => {
          if (m.role === 'tool' && m.tool_call_id) {
            return {
              role: 'tool' as const,
              content: m.content,
              tool_call_id: m.tool_call_id,
            }
          }
          return {
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }
        }),
      ],
    })

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
            )
          }
        } catch (err) {
          console.error('Stream error:', err)
        } finally {
          controller.close()
        }
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (err) {
    const error = err as { status?: number; message?: string }

    if (error.status === 429) {
      console.error('Upstream AI API rate limit:', error.message)
      return NextResponse.json(
        { error: `AI service rate limited: ${error.message ?? '429'}` },
        { status: 429 },
      )
    }

    console.error('AI API error:', error.message)
    return NextResponse.json(
      { error: 'AI service error. Please try again.' },
      { status: 502 },
    )
  }
}
