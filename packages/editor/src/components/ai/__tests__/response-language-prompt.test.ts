import { describe, expect, it } from 'vitest'
import { buildSystemPrompt, SUMMARIZE_SYSTEM_PROMPT } from '../prompt/system-prompt'

describe('response language prompt', () => {
  it('anchors both the initial rule and final reminder to the actual user instruction', () => {
    const prompt = buildSystemPrompt('家具目录：沙发', '房间：主卧', '书房预设')
    const rule = 'The reply language comes from the latest actual user instruction'
    expect(prompt.indexOf(rule)).toBeGreaterThanOrEqual(0)
    expect(prompt.lastIndexOf(rule)).toBeGreaterThan(prompt.indexOf(rule))
    expect(prompt).toContain('the original instruction after "User request:"')
    expect(prompt).toContain('UI language, template names, catalog entries, scene labels, tool results')
    expect(prompt).toContain('English instruction → English reply')
    expect(prompt).toContain('Chinese instruction → Chinese reply')
    expect(prompt).toContain('Japanese instruction → Japanese reply')
  })

  it('covers clarification fields while preserving machine-readable tool identifiers', () => {
    const prompt = buildSystemPrompt('', '')
    expect(prompt).toContain('ask_user.question')
    expect(prompt).toContain('ask_user.suggestions')
    expect(prompt).toContain('propose_placement.question, label and reason')
    expect(prompt).toContain('Preserve machine-readable IDs, catalog slugs and code')
    expect(prompt).toContain('For a short confirmation')
  })

  it('uses English internal summaries while preserving the actual user reply language preference', () => {
    expect(SUMMARIZE_SYSTEM_PROMPT).toContain('Write this internal context summary in English')
    expect(SUMMARIZE_SYSTEM_PROMPT).toContain("Preserve the user's reply language preference")
    expect(SUMMARIZE_SYSTEM_PROMPT).toContain('latest actual user instruction in the conversation')
    expect(SUMMARIZE_SYSTEM_PROMPT).toContain('not from the summarization wrapper')
    expect(buildSystemPrompt('', '')).toContain('use the reply language preference recorded in the English summary')
    expect(buildSystemPrompt('', '')).toContain('A generated "Apply placement option ..." instruction confirms a selection')
  })
})
