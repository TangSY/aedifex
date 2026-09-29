// ============================================================================
// AI Planner
// Detects complex instructions and generates step-by-step execution plans.
// Integrates with building-templates.ts for structured building generation.
// Called from the agent loop BEFORE the first LLM call to inject planning
// context into the conversation.
// ============================================================================

import { detectBuildingRequest, generatePlanFromTemplate } from './building-templates'
import type { BuildingTemplate } from './building-templates'

// ============================================================================
// Complex Instruction Detection
// ============================================================================

/** Patterns that indicate a complex multi-step request */
const COMPLEX_PATTERNS = [
  // Multi-level / multi-story
  /(\d+)\s*层/, /(\d+)\s*story/i, /(\d+)\s*floor/i, /(\d+)\s*楼/,
  // Complete building types
  /别墅/i, /villa/i, /公寓/i, /apartment/i, /办公/i, /office/i,
  /两室/, /三室/, /一室/, /开间/, /studio/i,
  // Multi-room requests — require an explicit room-count context. The old
  // /\d+.*间/ was so greedy that "5m x 4m 的房间" and "墙中间加一扇门"
  // both triggered full planning (plan-confirmation round-trips for trivial
  // single-room asks, QA-AI 2026-06-12).
  /多.*房间/, /multiple.*room/i, /几个?(房间|卧室|卫生间)/,
  /[两二三四五六七八九十\d]+\s*[个间]?\s*(房间|卧室|卫生间)/,
  // Complete layout requests
  /整个|整套|完整|全部/, /entire|complete|whole|full/i,
  // Furnish entire room/building
  /布置.*整个/, /furnish.*entire/i, /装修/, /decorate.*all/i,
]

/** A single-floor layout with at least this many rooms is treated as a large
 *  build that benefits from staged (shell-first, furnish-in-batches) execution
 *  — same failure mode as multi-floor: the LLM over-simplifies partitions and
 *  drops furniture when it does everything in one giant run. */
const LARGE_LAYOUT_ROOM_COUNT = 4

/** Patterns for simple requests that should NOT trigger planning */
const SIMPLE_PATTERNS = [
  // Single item operations
  /^放一/, /^add\s+(a|one|the)\s/i, /^移[除动]/, /^remove/i, /^move/i,
  // Single wall/door/window
  /^加一/, /^添加一/,
  // Questions
  /^[？?]/, /还有什么/, /what.*can/i, /suggest/i,
]

export interface PlanStep {
  /** Step number (1-based) */
  step: number
  /** Human-readable description */
  description: string
  /** Tool type hint (batch_operations, add_level, etc.) */
  toolHint: string
  /** Dependencies: must complete before this step */
  dependsOn: number[]
}

export interface ExecutionPlan {
  /** Whether a plan was generated (false = simple task, no plan needed) */
  isComplex: boolean
  /** Matched building template, if any */
  template: BuildingTemplate | null
  /** Plan steps to present to user via ask_user */
  steps: PlanStep[]
  /** Human-readable plan summary for injection into conversation */
  planSummary: string
  /**
   * True for large multi-floor builds: execute in two stages — build the full
   * structural shell first, then confirm furniture floor-by-floor via ask_user.
   * A single giant run makes the LLM drop whole steps (an entire floor's
   * furniture) and over-simplify partitions; staged keeps each turn small.
   */
  phased: boolean
}

/**
 * Detect if a user message requires complex multi-step planning.
 * Returns true if the message matches complex patterns and does NOT match simple patterns.
 */
export function isComplexInstruction(userMessage: string): boolean {
  const msg = userMessage.trim()

  // Short messages are unlikely to be complex
  if (msg.length < 4) return false

  // Check simple patterns first (quick exit)
  if (SIMPLE_PATTERNS.some((p) => p.test(msg))) return false

  // Check complex patterns
  return COMPLEX_PATTERNS.some((p) => p.test(msg))
}

/**
 * Generate an execution plan for a complex instruction.
 * Uses building templates when available, falls back to generic multi-step planning.
 */
export function generateExecutionPlan(userMessage: string): ExecutionPlan {
  if (!isComplexInstruction(userMessage)) {
    return { isComplex: false, template: null, steps: [], planSummary: '', phased: false }
  }

  // Try to match a building template
  const template = detectBuildingRequest(userMessage)

  if (template) {
    return generateTemplateBasedPlan(template)
  }

  // No template match — generate generic multi-step plan
  return generateGenericPlan(userMessage)
}

// ============================================================================
// Template-Based Planning
// ============================================================================

function generateTemplateBasedPlan(template: BuildingTemplate): ExecutionPlan {
  // Staged execution: multi-floor builds OR large single-floor layouts
  // (≥ LARGE_LAYOUT_ROOM_COUNT rooms). Build the shell first, then furnish in
  // small confirmed batches so nothing gets dropped or over-simplified.
  const totalRooms = template.floors.reduce((sum, f) => sum + f.rooms.length, 0)
  const phased = template.floors.length > 1 || totalRooms >= LARGE_LAYOUT_ROOM_COUNT
  const steps: PlanStep[] = []
  let stepNum = 1
  let prevStep = 0
  const linkPrev = () => (prevStep > 0 ? [prevStep] : [])

  for (let i = 0; i < template.floors.length; i++) {
    const floor = template.floors[i]!

    // Step: Create level (skip for level 0 which exists by default)
    if (i > 0) {
      steps.push({
        step: stepNum,
        description: `Create ${floor.label} (Level ${floor.level})`,
        toolHint: 'add_level',
        dependsOn: linkPrev(),
      })
      prevStep = stepNum
      stepNum++
    }

    // Step: Build walls for all rooms on this floor
    const roomNames = floor.rooms.map((r) => r.name).join(', ')
    steps.push({
      step: stepNum,
      description: `Build walls for ${floor.label}: ${roomNames}`,
      toolHint: 'batch_operations (add_wall)',
      dependsOn: linkPrev(),
    })
    const wallStep = stepNum
    prevStep = stepNum
    stepNum++

    // Step: Add doors and windows
    const totalDoors = floor.rooms.reduce((sum, r) => sum + r.doors, 0)
    const totalWindows = floor.rooms.reduce((sum, r) => sum + r.windows, 0)
    if (totalDoors > 0 || totalWindows > 0) {
      steps.push({
        step: stepNum,
        description: `Add ${totalDoors} doors and ${totalWindows} windows on ${floor.label}`,
        toolHint: 'batch_operations (add_door, add_window)',
        dependsOn: [wallStep],
      })
      prevStep = stepNum
      stepNum++
    }

    // Step: Place furniture in each room — only inline for single-floor plans.
    // Phased plans defer ALL furniture to a single floor-by-floor stage at the
    // end so the model never tries to furnish everything in one run.
    if (!phased) {
      const furnishedRooms = floor.rooms.filter((r) => r.furniture.length > 0)
      if (furnishedRooms.length > 0) {
        steps.push({
          step: stepNum,
          description: `Place furniture in ${furnishedRooms.length} rooms on ${floor.label}`,
          toolHint: 'batch_operations (add_item)',
          dependsOn: [wallStep],
        })
        prevStep = stepNum
        stepNum++
      }
    }
  }

  // Stairs between levels (multi-story shell).
  if (template.floors.length > 1) {
    steps.push({
      step: stepNum,
      description: `Add stairs between ${template.floors.length} levels`,
      toolHint: 'add_stair',
      dependsOn: linkPrev(),
    })
    prevStep = stepNum
    stepNum++
  }

  // Phased: a single deferred stage that furnishes one floor at a time,
  // each gated behind an ask_user confirmation.
  if (phased) {
    const cadence = template.floors.length > 1 ? 'one floor at a time' : 'one room group at a time'
    steps.push({
      step: stepNum,
      description: `Shell complete — furnish ${cadence}, confirming with the user before each`,
      toolHint: 'ask_user → batch_operations (add_item)',
      dependsOn: linkPrev(),
    })
  }

  const planText = generatePlanFromTemplate(template, phased)

  return {
    isComplex: true,
    template,
    steps,
    planSummary: planText,
    phased,
  }
}

// ============================================================================
// Generic Multi-Step Planning (no template match)
// ============================================================================

function generateGenericPlan(userMessage: string): ExecutionPlan {
  const steps: PlanStep[] = []
  const msg = userMessage.toLowerCase()

  // Detect scope from the message
  const hasMultiRoom = /多.*房间|multiple.*room|[两二三四五六七八九十\d]+\s*[个间]?\s*(房间|卧室|卫生间)|两室|三室/i.test(msg)
  const hasMultiLevel = /(\d+)\s*层|(\d+)\s*story|(\d+)\s*floor/i.test(msg)
  const hasFurniture = /布置|furnish|装修|decorate|家具|furniture/i.test(msg)

  let stepNum = 1

  if (hasMultiLevel) {
    // Extract floor count
    const floorMatch = msg.match(/(\d+)\s*(?:层|story|floor|楼)/i)
    const floorCount = floorMatch ? parseInt(floorMatch[1]!) : 2

    steps.push({
      step: stepNum++,
      description: `Create building structure with ${floorCount} levels`,
      toolHint: 'add_building + add_level',
      dependsOn: [],
    })
  }

  if (hasMultiRoom) {
    steps.push({
      step: stepNum++,
      description: 'Build walls to create room partitions',
      toolHint: 'batch_operations (add_wall)',
      dependsOn: stepNum > 2 ? [1] : [],
    })

    steps.push({
      step: stepNum++,
      description: 'Add doors between rooms and windows on exterior walls',
      toolHint: 'batch_operations (add_door, add_window)',
      dependsOn: [stepNum - 2],
    })
  }

  // Staged for multi-floor OR explicit multi-room generic builds — defer
  // furniture to a small-batch confirmation stage instead of one giant step.
  const phased = hasMultiLevel || hasMultiRoom

  if (phased) {
    const cadence = hasMultiLevel ? 'one floor at a time' : 'one room group at a time'
    steps.push({
      step: stepNum++,
      description: `Shell complete — furnish ${cadence}, confirming with the user before each`,
      toolHint: 'ask_user → batch_operations (add_item)',
      dependsOn: stepNum > 2 ? [stepNum - 2] : [],
    })
  } else if (hasFurniture) {
    steps.push({
      step: stepNum++,
      description: 'Place furniture in each room',
      toolHint: 'batch_operations (add_item)',
      dependsOn: hasMultiRoom ? [stepNum - 2] : [],
    })
  }

  // Fallback: if no specific scope detected, create a generic 3-step plan
  if (steps.length === 0) {
    steps.push(
      { step: 1, description: 'Create structure (walls, doors, windows)', toolHint: 'batch_operations', dependsOn: [] },
      { step: 2, description: 'Place furniture and fixtures', toolHint: 'batch_operations (add_item)', dependsOn: [1] },
      { step: 3, description: 'Final adjustments and review', toolHint: 'move_item / ask_user', dependsOn: [2] },
    )
  }

  // Build summary text
  const summaryLines = steps.map((s) => `  Step ${s.step}: ${s.description}`)
  const planSummary = `Execution Plan (${steps.length} steps):\n${summaryLines.join('\n')}`

  return {
    isComplex: true,
    template: null,
    steps,
    planSummary,
    phased,
  }
}

// ============================================================================
// Plan Injection
// Generates a planning prompt that can be prepended to the user's message
// so the LLM follows the structured plan.
// ============================================================================

/**
 * Generate a planning context string to inject into the conversation.
 * This is prepended to the user's first message when a complex instruction is detected.
 *
 * The LLM will see this as additional context and should use ask_user to present
 * the plan to the user before executing.
 */
export function buildPlanningContext(plan: ExecutionPlan): string {
  if (!plan.isComplex || plan.steps.length === 0) return ''

  const lines: string[] = []
  lines.push('[SYSTEM: Complex task detected. Present the following plan to the user via ask_user before executing.]')
  lines.push('')

  if (plan.template) {
    lines.push(`Matched template: ${plan.template.name} (${plan.template.nameCN})`)
    lines.push(`Footprint: ${plan.template.footprint[0]}m × ${plan.template.footprint[1]}m`)
    lines.push('')
  }

  lines.push(plan.planSummary)
  lines.push('')
  lines.push('Present this plan to the user using ask_user. Ask if they want to proceed or modify any steps.')

  if (plan.phased) {
    lines.push('')
    lines.push('[STAGED EXECUTION — MANDATORY for this large build]')
    lines.push('1. After the user confirms, build the COMPLETE structural shell first: every wall and room partition promised in the plan, plus doors, windows, slab and ceiling for each floor — and for a multi-storey building also the stairs between levels and the roof. Build the FULL set of room partitions; do NOT collapse a multi-room layout into a single outer shell. Do NOT place ANY furniture during this stage.')
    lines.push('2. When the shell is finished, STOP and use ask_user to offer furnishing in SMALL batches — ONE FLOOR AT A TIME for a multi-storey building, or ONE ROOM (or room group) AT A TIME for a single floor. e.g. question "The Ground Floor shell is ready — shall I furnish it now?", suggestions ["Furnish it", "Skip it"]. Furnish only that part, then ask about the next.')
    lines.push('3. NEVER furnish the whole building in one batch. Each small step is what keeps rooms from being skipped or the layout left half-finished.')
  } else {
    lines.push('After user confirms, execute one step at a time. Do NOT batch all steps together.')
  }

  return lines.join('\n')
}
