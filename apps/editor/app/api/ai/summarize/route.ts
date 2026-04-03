import { type NextRequest, NextResponse } from 'next/server'
import { SUMMARIZE_SYSTEM_PROMPT } from '@aedifex/editor/ai/prompt'
import {
  AI_API_KEY,
  AI_SUMMARIZE_MAX_TOKENS,
  AI_SUMMARIZE_MODEL,
  createAIClient,
} from '../config'

// ============================================================================
// Conversation Summarization API Route
// Uses lightweight model for cost-efficient conversation summarization.
// Called when conversation history exceeds threshold (~20 messages).
// ============================================================================

export async function POST(request: NextRequest) {
  if (!AI_API_KEY) {
    return NextResponse.json(
      { error: 'AI service not configured.' },
      { status: 503 },
    )
  }

  let body: { messages: { role: string; content: string }[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { messages } = body
  if (!messages?.length) {
    return NextResponse.json({ error: 'No messages to summarize.' }, { status: 400 })
  }

  const conversationText = messages
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n')

  // DRY A-D5: Use shared factory function
  const openai = createAIClient()

  try {
    const response = await openai.chat.completions.create({
      model: AI_SUMMARIZE_MODEL,
      max_tokens: AI_SUMMARIZE_MAX_TOKENS,
      messages: [
        { role: 'system', content: SUMMARIZE_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Please summarize this conversation:\n\n${conversationText}`,
        },
      ],
    })

    const summary = response.choices[0]?.message?.content ?? ''

    return NextResponse.json({ summary })
  } catch (err) {
    console.error('Summarization error:', err)
    return NextResponse.json(
      { error: 'Summarization failed.' },
      { status: 502 },
    )
  }
}
