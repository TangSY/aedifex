import { describe, expect, it } from 'vitest'
import { buildSystemPrompt, SUMMARIZE_SYSTEM_PROMPT } from '../prompt/system-prompt'
import { OPENAI_TOOLS } from '../prompt/openai-tools'
import { findTemplate, generatePlanFromTemplate, getAvailableTemplates } from '../building-templates'
import { buildPlanningContext, generateExecutionPlan } from '../ai-planner'
import { analyzeRoom, formatRoomAnalysis } from '../room-analyzer'
import { buildPlacementOptionMessage } from '../placement-option-message'

const nonEnglishScript = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u

describe('English application-provided AI context', () => {
  it('uses English for fixed system instructions and every tool schema', () => {
    expect(buildSystemPrompt('', '')).not.toMatch(nonEnglishScript)
    expect(SUMMARIZE_SYSTEM_PROMPT).not.toMatch(nonEnglishScript)
    expect(JSON.stringify(OPENAI_TOOLS)).not.toMatch(nonEnglishScript)
  })

  it('keeps template plans and injected planning context English for either input language', () => {
    for (const entry of getAvailableTemplates()) {
      const template = findTemplate(entry.id)!
      expect(template).toBeDefined()
      expect(generatePlanFromTemplate(template)).not.toMatch(nonEnglishScript)
      expect(generatePlanFromTemplate(template, true)).not.toMatch(nonEnglishScript)
      for (const input of [entry.name, entry.nameCN]) {
        const plan = generateExecutionPlan(`Create an entire ${input}`)
        expect(plan.isComplex).toBe(true)
        expect(plan.planSummary).not.toMatch(nonEnglishScript)
        expect(buildPlanningContext(plan)).not.toMatch(nonEnglishScript)
      }
    }
    expect(generateExecutionPlan('生成三层别墅').template?.id).toBe('villa-3-story')
  })

  it('emits English room analysis without localized display labels', () => {
    for (const slugs of [
      ['sofa'], ['bed'], ['stove'], ['toilet'], ['desk', 'office-chair'],
      ['dining-table'], ['shelf', 'storage-cabinet'], [],
    ]) {
      const analysis = analyzeRoom(slugs.map((catalogSlug) => ({ catalogSlug })))
      const context = formatRoomAnalysis(analysis)
      expect(context).not.toMatch(nonEnglishScript)
      if (analysis.type !== 'unknown') expect(context).toContain(`Room type: ${analysis.label}`)
    }
  })

  it('preserves original user-owned names for scene and preset resolution', () => {
    const prompt = buildSystemPrompt('User asset: 圆桌', 'Zone: 主卧', '日式书房 (12 nodes)')
    expect(prompt).toContain('User asset: 圆桌')
    expect(prompt).toContain('Zone: 主卧')
    expect(prompt).toContain('日式书房 (12 nodes)')
  })

  it('confirms a placement in English without echoing localized model-generated text', () => {
    const message = buildPlacementOptionMessage({
      id: 'opt3', label: '方案3：床头靠北墙', reason: '保留通道',
      catalogSlug: 'double-bed', position: [1.5, 0, 2.5], rotationY: 0,
    })
    expect(message).not.toMatch(nonEnglishScript)
    expect(message).toContain('Apply placement option "opt3"')
    expect(message).toContain('catalogSlug="double-bed", position=[1.5, 0, 2.5], rotationY=0')
    expect(message).toContain('using a single add_item call')
    expect(message).toContain('Do NOT remove, move, or modify any existing items')
  })
})
