// ============================================================================
// AI API Configuration
// All AI-related environment variables centralized here.
// ============================================================================

/** LLM API key (required) */
export const AI_API_KEY = process.env.AI_API_KEY ?? ''

/** LLM API base URL — supports OpenAI, compatible proxies, etc. */
export const AI_BASE_URL = process.env.AI_BASE_URL ?? 'https://api.openai.com/v1'

/** Primary model for chat (tool-use capable) */
export const AI_CHAT_MODEL = process.env.AI_CHAT_MODEL ?? 'gpt-4o'

/** Lightweight model for summarization */
export const AI_SUMMARIZE_MODEL = process.env.AI_SUMMARIZE_MODEL ?? 'gpt-4o-mini'

/** Rate limiting */
export const AI_RATE_LIMIT_REQUESTS = Number(process.env.AI_RATE_LIMIT_REQUESTS ?? 60)
export const AI_RATE_LIMIT_TOKENS = Number(process.env.AI_RATE_LIMIT_TOKENS ?? 500_000)
