// ============================================================================
// Token Estimator
// Inspired by Claude Code's tokenCountWithEstimation (src/utils/tokens.ts)
// Simple character-based estimation without external tokenizer dependency.
// ============================================================================

/**
 * Estimate token count for a text string (no external tokenizer needed).
 *
 * Accuracy is approximately ±20%, sufficient for compression trigger thresholds.
 * For precise values, use the API-returned usage.prompt_tokens.
 *
 * Estimation rules (based on GPT-4 tokenizer statistics):
 * - CJK characters: ~0.6 tokens/char (UTF-8 multi-byte encoding)
 * - Latin/English: ~0.25 tokens/char (~1.3 tokens/word)
 * - JSON/code: ~0.4 tokens/char
 */
export function estimateTokens(text: string): number {
  if (!text) return 0

  let tokenCount = 0

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)

    if (code >= 0x4e00 && code <= 0x9fff) {
      // CJK Unified Ideographs: ~0.6 tokens per character
      tokenCount += 0.6
    } else if (code > 0x3000 && code < 0x4dbf) {
      // CJK punctuation and kana: ~0.5 tokens per character
      tokenCount += 0.5
    } else {
      // Latin/ASCII: ~1 token per 4 characters
      tokenCount += 0.25
    }
  }

  return Math.ceil(tokenCount)
}

/**
 * Estimate total token count for a message array.
 * Includes structural overhead per message (role markers ~4 tokens).
 */
export function estimateMessagesTokens(
  messages: { role: string; content: string }[],
): number {
  const MESSAGE_OVERHEAD = 4 // role/separator overhead per message
  let total = 0

  for (const msg of messages) {
    total += estimateTokens(msg.content) + MESSAGE_OVERHEAD
  }

  return total
}

// ============================================================================
// Context Budget
// ============================================================================

/** Context window sizes for different models (tokens) */
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gpt-4-turbo': 128_000,
  'gpt-4': 8_192,
  'gpt-3.5-turbo': 16_385,
}

/** Reserved token allocation */
const RESERVED_TOKENS = {
  systemPrompt: 4_000,
  toolDefinitions: 2_000,
  outputBuffer: 4_000,
  safetyMargin: 2_000,
}

const TOTAL_RESERVED = Object.values(RESERVED_TOKENS).reduce((a, b) => a + b, 0)

/** Auto-compact trigger threshold: 85% of available space */
const AUTO_COMPACT_THRESHOLD_RATIO = 0.85

/**
 * Get the token threshold for auto-compaction.
 * Compaction should be triggered when conversation tokens exceed this value.
 */
export function getAutoCompactThreshold(model = 'gpt-4o'): number {
  const contextWindow = MODEL_CONTEXT_WINDOWS[model] ?? 128_000
  const available = contextWindow - TOTAL_RESERVED
  return Math.floor(available * AUTO_COMPACT_THRESHOLD_RATIO)
}

/**
 * Determine whether auto-compaction should be triggered.
 */
export function shouldAutoCompact(
  messages: { role: string; content: string }[],
  model = 'gpt-4o',
): boolean {
  const tokenCount = estimateMessagesTokens(messages)
  const threshold = getAutoCompactThreshold(model)
  return tokenCount >= threshold
}
