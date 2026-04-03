// ============================================================================
// AI API Configuration
// All AI-related environment variables centralized here.
// ============================================================================

import OpenAI from 'openai'

/** LLM API key (required) */
export const AI_API_KEY = process.env.AI_API_KEY ?? ''

/** LLM API base URL — supports OpenAI, compatible proxies, etc. */
export const AI_BASE_URL = process.env.AI_BASE_URL ?? 'https://api.openai.com/v1'

/** Primary model for chat (tool-use capable) */
export const AI_CHAT_MODEL = process.env.AI_CHAT_MODEL ?? 'gpt-4o'

/** Lightweight model for summarization */
export const AI_SUMMARIZE_MODEL = process.env.AI_SUMMARIZE_MODEL ?? 'gpt-4o-mini'

/** Max output tokens per request */
export const AI_CHAT_MAX_TOKENS = Number(process.env.AI_CHAT_MAX_TOKENS ?? 4096)
export const AI_SUMMARIZE_MAX_TOKENS = Number(process.env.AI_SUMMARIZE_MAX_TOKENS ?? 4096)

/** Factory function — creates a pre-configured OpenAI client with maxRetries=0. */
export function createAIClient(): OpenAI {
  return new OpenAI({ apiKey: AI_API_KEY, baseURL: AI_BASE_URL, maxRetries: 0 })
}
