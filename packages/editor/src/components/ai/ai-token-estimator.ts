// ============================================================================
// Token Estimator
// Inspired by Claude Code's tokenCountWithEstimation (src/utils/tokens.ts)
// Simple character-based estimation without external tokenizer dependency.
// ============================================================================

/**
 * 估算文本的 token 数（无需外部 tokenizer）
 *
 * 精度约 ±20%，足以用于压缩触发阈值判断。
 * 如需精确值，应使用 API 返回的 usage.prompt_tokens。
 *
 * 估算规则（基于 GPT-4 tokenizer 统计）：
 * - 中文：约 0.6 tokens/字符（UTF-8 多字节编码）
 * - 英文：约 0.25 tokens/字符（≈ 1.3 tokens/word）
 * - JSON/代码：约 0.4 tokens/字符
 */
export function estimateTokens(text: string): number {
  if (!text) return 0

  let tokenCount = 0

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)

    if (code >= 0x4e00 && code <= 0x9fff) {
      // CJK 统一汉字：每个字符约 0.6 tokens
      tokenCount += 0.6
    } else if (code > 0x3000 && code < 0x4dbf) {
      // CJK 标点和假名：每个字符约 0.5 tokens
      tokenCount += 0.5
    } else {
      // Latin/ASCII：每 4 字符约 1 token
      tokenCount += 0.25
    }
  }

  return Math.ceil(tokenCount)
}

/**
 * 估算消息数组的总 token 数
 * 包含每条消息的结构开销（role 标记 ~4 tokens）
 */
export function estimateMessagesTokens(
  messages: { role: string; content: string }[],
): number {
  const MESSAGE_OVERHEAD = 4 // 每条消息的 role/separator 开销
  let total = 0

  for (const msg of messages) {
    total += estimateTokens(msg.content) + MESSAGE_OVERHEAD
  }

  return total
}

// ============================================================================
// Context Budget
// ============================================================================

/** 不同模型的上下文窗口大小（tokens） */
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gpt-4-turbo': 128_000,
  'gpt-4': 8_192,
  'gpt-3.5-turbo': 16_385,
}

/** 预留 token 分配 */
const RESERVED_TOKENS = {
  systemPrompt: 4_000,
  toolDefinitions: 2_000,
  outputBuffer: 4_000,
  safetyMargin: 2_000,
}

const TOTAL_RESERVED = Object.values(RESERVED_TOKENS).reduce((a, b) => a + b, 0)

/** 自动压缩触发阈值：可用空间的 85% */
const AUTO_COMPACT_THRESHOLD_RATIO = 0.85

/**
 * 获取自动压缩的 token 阈值
 * 当对话 token 数超过此值时应触发压缩
 */
export function getAutoCompactThreshold(model = 'gpt-4o'): number {
  const contextWindow = MODEL_CONTEXT_WINDOWS[model] ?? 128_000
  const available = contextWindow - TOTAL_RESERVED
  return Math.floor(available * AUTO_COMPACT_THRESHOLD_RATIO)
}

/**
 * 判断是否应触发自动压缩
 */
export function shouldAutoCompact(
  messages: { role: string; content: string }[],
  model = 'gpt-4o',
): boolean {
  const tokenCount = estimateMessagesTokens(messages)
  const threshold = getAutoCompactThreshold(model)
  return tokenCount >= threshold
}
