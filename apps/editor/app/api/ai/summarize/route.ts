import { type NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import {
  AI_API_KEY,
  AI_BASE_URL,
  AI_SUMMARIZE_MODEL,
} from '../config'

// ============================================================================
// Conversation Summarization API Route
// Uses lightweight model for cost-efficient conversation summarization.
// Called when conversation history exceeds threshold (~20 messages).
// ============================================================================

const SUMMARIZE_SYSTEM_PROMPT = `You are a conversation summarizer for an AI interior design assistant.
Summarize the conversation history into a compact context that preserves:
1. Key design decisions made (what was added, removed, moved)
2. User preferences expressed (style, colors, layout preferences)
3. Current scene state changes
4. Any pending requests or follow-ups

Keep the summary under 500 words. Use bullet points. Respond in the same language as the conversation.`

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

  // Format messages for summarization
  const conversationText = messages
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n')

  const openai = new OpenAI({
    apiKey: AI_API_KEY,
    baseURL: AI_BASE_URL,
  })

  try {
    const response = await openai.chat.completions.create({
      model: AI_SUMMARIZE_MODEL,
      max_tokens: 1024,
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
