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
  // Multi-room requests
  /多.*房间/, /multiple.*room/i, /几.*间/, /\d+.*间/,
  // Complete layout requests
  /整个|整套|完整|全部/, /entire|complete|whole|full/i,
  // Furnish entire room/building
  /布置.*整个/, /furnish.*entire/i, /装修/, /decorate.*all/i,
]

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
    return { isComplex: false, template: null, steps: [], planSummary: '' }
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
  const steps: PlanStep[] = []
  let stepNum = 1

  for (let i = 0; i < template.floors.length; i++) {
    const floor = template.floors[i]!

    // Step: Create level (skip for level 0 which exists by default)
    if (i > 0) {
      steps.push({
        step: stepNum,
        description: `Create ${floor.label} (Level ${floor.level})`,
        toolHint: 'add_level',
        dependsOn: i > 1 ? [stepNum - 3] : [], // depends on previous floor completion
      })
      stepNum++
    }

    // Step: Build walls for all rooms on this floor
    const roomNames = floor.rooms.map((r) => r.name).join(', ')
    steps.push({
      step: stepNum,
      description: `Build walls for ${floor.label}: ${roomNames}`,
      toolHint: 'batch_operations (add_wall)',
      dependsOn: i > 0 ? [stepNum - 1] : [],
    })
    const wallStep = stepNum
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
      stepNum++
    }

    // Step: Place furniture in each room
    const furnishedRooms = floor.rooms.filter((r) => r.furniture.length > 0)
    if (furnishedRooms.length > 0) {
      steps.push({
        step: stepNum,
        description: `Place furniture in ${furnishedRooms.length} rooms on ${floor.label}`,
        toolHint: 'batch_operations (add_item)',
        dependsOn: [wallStep],
      })
      stepNum++
    }
  }

  // Final step: stairs between levels (if multi-story)
  if (template.floors.length > 1) {
    steps.push({
      step: stepNum,
      description: `Add stairs between ${template.floors.length} levels`,
      toolHint: 'add_stair',
      dependsOn: [stepNum - 1],
    })
  }

  const planText = generatePlanFromTemplate(template)

  return {
    isComplex: true,
    template,
    steps,
    planSummary: planText,
  }
}

// ============================================================================
// Generic Multi-Step Planning (no template match)
// ============================================================================

function generateGenericPlan(userMessage: string): ExecutionPlan {
  const steps: PlanStep[] = []
  const msg = userMessage.toLowerCase()

  // Detect scope from the message
  const hasMultiRoom = /多.*房间|multiple.*room|\d+.*间|两室|三室/i.test(msg)
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

  if (hasFurniture || hasMultiRoom) {
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
  lines.push('After user confirms, execute one step at a time. Do NOT batch all steps together.')

  return lines.join('\n')
}
