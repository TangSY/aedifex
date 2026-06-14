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

  // Phased execution (QA-AI 2026-06-14): multi-floor builds split into
  // "shell first, furniture floor-by-floor" so the LLM stops dropping an
  // entire floor's furniture / over-simplifying partitions in one giant run.
  it('marks a 3-story villa plan as phased and defers all furniture', () => {
    const plan = generateExecutionPlan('帮我设计一个三层别墅')
    expect(plan.phased).toBe(true)
    // No inline per-floor furniture steps — furniture is one deferred stage.
    const inlineFurnitureSteps = plan.steps.filter(
      (s) => /Place furniture in \d+ rooms/.test(s.description),
    )
    expect(inlineFurnitureSteps.length).toBe(0)
    // Exactly one floor-by-floor furnishing stage at the end.
    const deferredStages = plan.steps.filter((s) => /one floor at a time/.test(s.description))
    expect(deferredStages.length).toBe(1)
    // Plan summary uses the staged strategy wording.
    expect(plan.planSummary).toContain('Stage 1')
    expect(plan.planSummary).toContain('Stage 2')
  })

  it('does NOT mark a SMALL single-floor template plan as phased', () => {
    // Studio apartment = 1 floor, 3 rooms (< LARGE_LAYOUT_ROOM_COUNT) → not phased.
    const plan = generateExecutionPlan('帮我做一个开间公寓')
    expect(plan.isComplex).toBe(true)
    if (plan.template) {
      expect(plan.template.floors.length).toBe(1)
      expect(plan.template.floors[0]!.rooms.length).toBeLessThan(4)
      expect(plan.phased).toBe(false)
      // Small single-floor plans keep inline furniture steps.
      expect(plan.planSummary).toContain('Execution steps:')
    }
  })

  // QA-AI 2026-06-14 follow-up: a large single-floor layout has the same
  // failure mode as multi-floor (over-simplified partitions, dropped
  // furniture in one giant run), so it now goes staged too.
  it('marks a LARGE single-floor layout as phased', () => {
    // Two-bedroom apartment = 1 floor, 5 rooms (≥ LARGE_LAYOUT_ROOM_COUNT).
    const plan = generateExecutionPlan('帮我做一个两室一厅')
    expect(plan.isComplex).toBe(true)
    if (plan.template) {
      expect(plan.template.floors.length).toBe(1)
      expect(plan.template.floors[0]!.rooms.length).toBeGreaterThanOrEqual(4)
      expect(plan.phased).toBe(true)
      // Furniture deferred to one staged room-group step (no inline furniture).
      const inlineFurniture = plan.steps.filter((st) => /Place furniture in \d+ rooms/.test(st.description))
      expect(inlineFurniture.length).toBe(0)
      expect(plan.planSummary).toContain('Stage 1')
      expect(plan.planSummary).toContain('room group at a time')
    }
  })

  it('marks a generic multi-floor request as phased', () => {
    const plan = generateExecutionPlan('帮我做一个3层的楼')
    expect(plan.isComplex).toBe(true)
    expect(plan.phased).toBe(true)
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
      phased: false,
    })
    expect(out).toBe('')
  })

  it('returns empty string when steps array is empty', () => {
    const out = buildPlanningContext({
      isComplex: true,
      template: null,
      steps: [],
      planSummary: 'ignored',
      phased: false,
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
      phased: false,
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
      phased: false,
    })
    expect(out).toContain('Test Villa')
    expect(out).toContain('测试别墅')
    expect(out).toContain('12m × 10m')
    expect(out).toContain('plan body')
  })

  it('emits the staged-execution mandate when plan.phased is true', () => {
    const out = buildPlanningContext({
      isComplex: true,
      template: null,
      steps: [
        { step: 1, description: 'build shell', toolHint: 'batch_operations', dependsOn: [] },
      ],
      planSummary: 'plan body',
      phased: true,
    })
    expect(out).toContain('STAGED EXECUTION')
    expect(out).toContain('ONE FLOOR AT A TIME')
    expect(out).toContain('Do NOT place ANY furniture during this stage')
  })

  it('uses the one-step-at-a-time wording when plan.phased is false', () => {
    const out = buildPlanningContext({
      isComplex: true,
      template: null,
      steps: [
        { step: 1, description: 'do thing', toolHint: 'add_wall', dependsOn: [] },
      ],
      planSummary: 'plan body',
      phased: false,
    })
    expect(out).toContain('execute one step at a time')
    expect(out).not.toContain('STAGED EXECUTION')
  })
})
