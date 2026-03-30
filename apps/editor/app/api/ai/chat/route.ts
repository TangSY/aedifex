import { type NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { buildSystemPrompt, OPENAI_TOOLS } from '@aedifex/editor/components/ai'
import {
  AI_API_KEY,
  AI_BASE_URL,
  AI_CHAT_MAX_TOKENS,
  AI_CHAT_MODEL,
  AI_RATE_LIMIT_REQUESTS,
  AI_RATE_LIMIT_TOKENS,
} from '../config'

// ============================================================================
// Rate Limiting (in-memory, per-instance)
// ============================================================================

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // 1 hour
const MAX_REQUESTS_PER_WINDOW = AI_RATE_LIMIT_REQUESTS
const MAX_TOKENS_PER_WINDOW = AI_RATE_LIMIT_TOKENS

interface RateLimitEntry {
  requestCount: number
  tokenCount: number
  windowStart: number
}

const rateLimits = new Map<string, RateLimitEntry>()

function checkRateLimit(clientId: string): { allowed: boolean; reason?: string } {
  const now = Date.now()
  let entry = rateLimits.get(clientId)

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    entry = { requestCount: 0, tokenCount: 0, windowStart: now }
    rateLimits.set(clientId, entry)
  }

  if (entry.requestCount >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, reason: 'Request limit exceeded. Please try again later.' }
  }

  if (entry.tokenCount >= MAX_TOKENS_PER_WINDOW) {
    return { allowed: false, reason: 'Token limit exceeded. Please try again later.' }
  }

  entry.requestCount++
  return { allowed: true }
}

function recordTokenUsage(clientId: string, tokens: number) {
  const entry = rateLimits.get(clientId)
  if (entry) {
    entry.tokenCount += tokens
  }
}

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

  const clientId = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'anonymous'
  const rateLimitCheck = checkRateLimit(clientId)
  if (!rateLimitCheck.allowed) {
    return NextResponse.json(
      { error: rateLimitCheck.reason },
      { status: 429 },
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
        let totalTokens = 0

        try {
          for await (const chunk of stream) {
            if (chunk.usage) {
              totalTokens = chunk.usage.total_tokens ?? totalTokens
            }

            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
            )

            const choice = chunk.choices?.[0]
            if (choice?.finish_reason) {
              recordTokenUsage(clientId, totalTokens)
            }
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
