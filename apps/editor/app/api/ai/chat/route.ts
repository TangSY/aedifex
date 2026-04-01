import { type NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { buildSystemPrompt, OPENAI_TOOLS } from '@aedifex/editor/ai/prompt'
import {
  AI_API_KEY,
  AI_BASE_URL,
  AI_CHAT_MAX_TOKENS,
  AI_CHAT_MODEL,
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

  const systemPrompt = buildSystemPrompt(catalogSummary, sceneContext)

  const openai = new OpenAI({
    apiKey: AI_API_KEY,
    baseURL: AI_BASE_URL,
    maxRetries: 0,
  })

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
