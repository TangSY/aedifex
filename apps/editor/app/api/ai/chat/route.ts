import { type NextRequest, NextResponse } from 'next/server'
import { buildSystemPrompt, OPENAI_TOOLS } from '@aedifex/editor/ai/prompt'
import {
  validateChatRequest,
  describeChatRequestError,
} from '@aedifex/editor/ai/contracts'
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

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  // Shared validator: role whitelist + length limits + tool_call_id check.
  // OSS and SaaS routes use the same contract to prevent silent drift.
  const result = validateChatRequest(body)
  if (!result.ok) {
    return NextResponse.json(
      { error: describeChatRequestError(result.error), code: result.error },
      { status: 400 },
    )
  }
  const { messages, catalogSummary, sceneContext, roomPresetSummary } = result.value

  const systemPrompt = buildSystemPrompt(catalogSummary, sceneContext, roomPresetSummary)

  // DRY A-D5: Use shared factory function
  const openai = createAIClient()

  try {
    // Forward client abort to the upstream LLM call so we don't keep paying for
    // tokens after the user cancelled. Without this, OpenAI keeps generating.
    const stream = await openai.chat.completions.create(
      {
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
      },
      { signal: request.signal },
    )

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
          // AbortError is the normal path when the client cancels mid-stream;
          // don't log it as a real error.
          if ((err as { name?: string })?.name !== 'AbortError') {
            console.error('Stream error:', err)
          }
        } finally {
          try {
            controller.close()
          } catch {
            // Controller may already be closed — safe to ignore
          }
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
    const error = err as { status?: number; message?: string; name?: string }

    // Client cancelled before the upstream call returned — exit silently with 499
    // (nginx convention for "client closed request"). No console noise, no 502.
    if (error.name === 'AbortError' || request.signal.aborted) {
      return new Response(null, { status: 499 })
    }

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
