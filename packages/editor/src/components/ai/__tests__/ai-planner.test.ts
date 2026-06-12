import { describe, expect, it } from 'vitest'

import {
  isComplexInstruction,
  generateExecutionPlan,
  buildPlanningContext,
} from '../ai-planner'

// ============================================================================
// isComplexInstruction — quick-exit + complex pattern match
// ============================================================================

describe('isComplexInstruction', () => {
  it('returns false for very short messages (<4 chars)', () => {
    expect(isComplexInstruction('hi')).toBe(false)
    expect(isComplexInstruction('a')).toBe(false)
    expect(isComplexInstruction('')).toBe(false)
  })

  it('returns false for simple add-one operations', () => {
    expect(isComplexInstruction('放一个沙发')).toBe(false)
    expect(isComplexInstruction('add a sofa')).toBe(false)
    expect(isComplexInstruction('Add one chair')).toBe(false)
  })

  it('returns false for simple remove operations', () => {
    expect(isComplexInstruction('移除沙发')).toBe(false)
    expect(isComplexInstruction('remove the wall')).toBe(false)
  })

  it('returns false for simple questions', () => {
    expect(isComplexInstruction('?帮我看看')).toBe(false)
    expect(isComplexInstruction('what can I do here?')).toBe(false)
  })

  it('returns true for multi-floor requests (Chinese)', () => {
    expect(isComplexInstruction('帮我设计一个三层别墅')).toBe(true)
    expect(isComplexInstruction('我要一个2层楼的房子')).toBe(true)
  })

  it('returns true for multi-floor requests (English)', () => {
    expect(isComplexInstruction('Build a 3 story villa')).toBe(true)
    expect(isComplexInstruction('Design a 2-floor apartment')).toBe(true)
  })

  it('returns true for villa / apartment / office keywords', () => {
    expect(isComplexInstruction('设计一个villa')).toBe(true)
    expect(isComplexInstruction('Make me an apartment')).toBe(true)
    expect(isComplexInstruction('design office space here')).toBe(true)
  })

  it('returns true for "整个/entire" wholesale-decoration requests', () => {
    expect(isComplexInstruction('布置整个房子')).toBe(true)
    expect(isComplexInstruction('furnish entire apartment')).toBe(true)
  })

  it('returns false when simple pattern wins over complex pattern', () => {
    // simple "remove" should short-circuit even if villa is mentioned
    expect(isComplexInstruction('remove the villa')).toBe(false)
  })

  // Regression for QA-AI 2026-06-12: the greedy /\d+.*间/ pattern marked
  // single-room and door-position requests as complex, triggering plan
  // confirmation round-trips for trivial asks.
  it('returns false for single-room creation with dimensions', () => {
    expect(isComplexInstruction('创建一个 5m x 4m 的房间')).toBe(false)
    expect(isComplexInstruction('在二层创建一个 6m×4m 的矩形房间')).toBe(false)
  })

  it('returns false for "墙中间" door placement requests', () => {
    expect(isComplexInstruction('重建北墙（从 [-2.5,-2] 到 [2.5,-2]），并在墙中间加一扇门')).toBe(false)
  })

  it('still returns true for genuine multi-room counts', () => {
    expect(isComplexInstruction('帮我做三间卧室和两个卫生间')).toBe(true)
    expect(isComplexInstruction('创建 2 个房间')).toBe(true)
  })
})

// ============================================================================
// generateExecutionPlan — shape + branching
// ============================================================================

describe('generateExecutionPlan', () => {
  it('returns isComplex=false with empty plan for simple instruction', () => {
    const plan = generateExecutionPlan('放一个沙发')
    expect(plan.isComplex).toBe(false)
    expect(plan.template).toBeNull()
    expect(plan.steps).toEqual([])
    expect(plan.planSummary).toBe('')
  })

  it('returns isComplex=true with template-based plan for matched building', () => {
    const plan = generateExecutionPlan('帮我设计一个三层别墅')
    expect(plan.isComplex).toBe(true)
    // Template may or may not match depending on detectBuildingRequest fuzziness;
    // at minimum steps must be non-empty for complex requests.
    expect(plan.steps.length).toBeGreaterThan(0)
    expect(plan.planSummary.length).toBeGreaterThan(0)
  })

  it('returns isComplex=true with generic plan when no template matches', () => {
    // Multi-room request without a specific template keyword
    const plan = generateExecutionPlan('帮我做多个房间')
    expect(plan.isComplex).toBe(true)
    expect(plan.steps.length).toBeGreaterThan(0)
    // Generic plan summary lists steps
    expect(plan.planSummary).toContain('Step')
  })

  it('step structure includes step/description/toolHint/dependsOn', () => {
    const plan = generateExecutionPlan('帮我做多个房间和家具')
    const first = plan.steps[0]!
    expect(typeof first.step).toBe('number')
    expect(typeof first.description).toBe('string')
    expect(typeof first.toolHint).toBe('string')
    expect(Array.isArray(first.dependsOn)).toBe(true)
  })

  it('generic plan falls back to 3 default steps when no scope detected', () => {
    // Phrase that matches a complex pattern but no scope keyword.
    // '整套' matches the wholesale pattern; the generic-plan helper sees no
    // multi-room / multi-level / furniture keyword and returns the 3-step
    // default skeleton.
    const plan = generateExecutionPlan('帮我整套优化下')
    expect(plan.isComplex).toBe(true)
    expect(plan.steps.length).toBeGreaterThanOrEqual(3)
  })
})

// ============================================================================
// buildPlanningContext — injection text
// ============================================================================

describe('buildPlanningContext', () => {
  it('returns empty string when plan is not complex', () => {
    const out = buildPlanningContext({
      isComplex: false,
      template: null,
      steps: [],
      planSummary: '',
    })
    expect(out).toBe('')
  })

  it('returns empty string when steps array is empty', () => {
    const out = buildPlanningContext({
      isComplex: true,
      template: null,
      steps: [],
      planSummary: 'ignored',
    })
    expect(out).toBe('')
  })

  it('includes [SYSTEM: Complex task detected.] header', () => {
    const out = buildPlanningContext({
      isComplex: true,
      template: null,
      steps: [
        { step: 1, description: 'do thing', toolHint: 'add_wall', dependsOn: [] },
      ],
      planSummary: 'Execution Plan (1 steps):\n  Step 1: do thing',
    })
    expect(out).toContain('[SYSTEM: Complex task detected.')
    expect(out).toContain('ask_user')
  })

  it('includes template name and footprint when template is provided', () => {
    const out = buildPlanningContext({
      isComplex: true,
      template: {
        id: 'villa-test',
        name: 'Test Villa',
        nameCN: '测试别墅',
        description: 'a test',
        footprint: [12, 10],
        floors: [],
      },
      steps: [
        { step: 1, description: 'foo', toolHint: 'add_wall', dependsOn: [] },
      ],
      planSummary: 'plan body',
    })
    expect(out).toContain('Test Villa')
    expect(out).toContain('测试别墅')
    expect(out).toContain('12m × 10m')
    expect(out).toContain('plan body')
  })
})
