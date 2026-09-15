import { describe, expect, it } from 'vitest'

import {
  estimateTokens,
  estimateMessagesTokens,
  getAutoCompactThreshold,
  shouldAutoCompact,
} from '../ai-token-estimator'

// ============================================================================
// estimateTokens — character-class weighting
// ============================================================================

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('weights ASCII characters at ~0.25 tokens/char (ceil)', () => {
    // 4 chars × 0.25 = 1.0 → ceil → 1
    expect(estimateTokens('abcd')).toBe(1)
    // 100 chars × 0.25 = 25
    expect(estimateTokens('a'.repeat(100))).toBe(25)
  })

  it('weights CJK characters at ~0.6 tokens/char', () => {
    // CJK Unified Ideographs U+4E00..U+9FFF
    // 1 char × 0.6 = 0.6 → ceil → 1
    expect(estimateTokens('一')).toBe(1)
    // 10 chars × 0.6 = 6
    expect(estimateTokens('你好世界中文测试样本')).toBe(6)
  })

  it('weights CJK punctuation / kana at ~0.5 tokens/char', () => {
    // hiragana/katakana lives in U+3000–U+4DBF range used by the estimator
    // e.g. 'あ' (U+3042) → 0.5 → ceil → 1
    expect(estimateTokens('あ')).toBe(1)
    // 10 chars × 0.5 = 5
    expect(estimateTokens('あいうえおかきくけこ')).toBe(5)
  })

  it('combines ASCII + CJK weights for mixed text', () => {
    // 'hello 你好' = 5 ascii + 1 space + 2 cjk
    // ascii(5+1) × 0.25 = 1.5
    // cjk(2) × 0.6 = 1.2
    // total = 2.7 → ceil → 3
    expect(estimateTokens('hello 你好')).toBe(3)
  })

  it('ceils fractional totals up', () => {
    // 1 ascii char = 0.25 → ceil → 1
    expect(estimateTokens('a')).toBe(1)
    // 3 ascii chars = 0.75 → ceil → 1
    expect(estimateTokens('abc')).toBe(1)
  })
})

// ============================================================================
// estimateMessagesTokens — sums content + 4-token overhead per message
// ============================================================================

describe('estimateMessagesTokens', () => {
  it('returns 0 + 0 for an empty array', () => {
    expect(estimateMessagesTokens([])).toBe(0)
  })

  it('adds 4-token overhead per message', () => {
    // 'a' → ceil(0.25) = 1 token + 4 overhead = 5
    expect(estimateMessagesTokens([{ role: 'user', content: 'a' }])).toBe(5)
  })

  it('sums multiple messages including each overhead', () => {
    // 2 messages: ('a' = 1) + 4 + ('b' = 1) + 4 = 10
    const tokens = estimateMessagesTokens([
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
    ])
    expect(tokens).toBe(10)
  })

  it('combines CJK content + ASCII content correctly', () => {
    // '你好' → ceil(1.2) = 2 + 4 = 6
    // 'hello' → ceil(1.25) = 2 + 4 = 6
    // total: 12
    const tokens = estimateMessagesTokens([
      { role: 'user', content: '你好' },
      { role: 'assistant', content: 'hello' },
    ])
    expect(tokens).toBe(12)
  })
})

// ============================================================================
// getAutoCompactThreshold — fixed at 100_000
// ============================================================================

describe('getAutoCompactThreshold', () => {
  it('returns 100_000 for the default model', () => {
    expect(getAutoCompactThreshold()).toBe(100_000)
  })

  it('returns 100_000 regardless of model argument', () => {
    expect(getAutoCompactThreshold('claude-3-5-sonnet')).toBe(100_000)
    expect(getAutoCompactThreshold('gpt-4o')).toBe(100_000)
  })
})

// ============================================================================
// shouldAutoCompact — boundary at threshold
// ============================================================================

describe('shouldAutoCompact', () => {
  it('returns false for short conversations', () => {
    const messages = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ]
    expect(shouldAutoCompact(messages)).toBe(false)
  })

  it('returns true when total tokens exceed 100_000 threshold', () => {
    // Build a conversation that crosses 100_000 tokens.
    // Each ASCII char ≈ 0.25 tokens; 'a' × 500_000 ≈ 125_000 tokens.
    const huge = 'a'.repeat(500_000)
    const messages = [{ role: 'user', content: huge }]
    expect(shouldAutoCompact(messages)).toBe(true)
  })

  it('returns true exactly at threshold (>= comparison)', () => {
    // Build content that hits ~100_000 tokens. Use ASCII: 100_000 / 0.25 = 400_000 chars
    // (overhead +4 nudges us past, ensuring >= 100_000)
    const big = 'a'.repeat(400_000)
    const messages = [{ role: 'user', content: big }]
    expect(shouldAutoCompact(messages)).toBe(true)
  })

  it('accepts a model argument without changing behavior', () => {
    // Same fixed 100_000 threshold regardless of model
    const huge = 'a'.repeat(500_000)
    expect(shouldAutoCompact([{ role: 'user', content: huge }], 'claude-3-5')).toBe(true)
  })
})
