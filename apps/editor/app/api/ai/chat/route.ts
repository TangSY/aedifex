import { type NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import type { ChatCompletionTool } from 'openai/resources/chat/completions'
import {
  AI_API_KEY,
  AI_BASE_URL,
  AI_CHAT_MODEL,
  AI_RATE_LIMIT_REQUESTS,
  AI_RATE_LIMIT_TOKENS,
} from '../config'

// ============================================================================
// Rate Limiting (in-memory, per-instance)
// ============================================================================

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // 1 hour
const MAX_REQUESTS_PER_WINDOW = AI_RATE_LIMIT_REQUESTS
const MAX_TOKENS_PER_WINDOW = AI_RATE_LIMIT_TOKENS

interface RateLimitEntry {
  requestCount: number
  tokenCount: number
  windowStart: number
}

// Simple in-memory store (resets on deploy — acceptable for Phase 1)
const rateLimits = new Map<string, RateLimitEntry>()

function checkRateLimit(clientId: string): { allowed: boolean; reason?: string } {
  const now = Date.now()
  let entry = rateLimits.get(clientId)

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    entry = { requestCount: 0, tokenCount: 0, windowStart: now }
    rateLimits.set(clientId, entry)
  }

  if (entry.requestCount >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, reason: 'Request limit exceeded. Please try again later.' }
  }

  if (entry.tokenCount >= MAX_TOKENS_PER_WINDOW) {
    return { allowed: false, reason: 'Token limit exceeded. Please try again later.' }
  }

  entry.requestCount++
  return { allowed: true }
}

function recordTokenUsage(clientId: string, tokens: number) {
  const entry = rateLimits.get(clientId)
  if (entry) {
    entry.tokenCount += tokens
  }
}

// ============================================================================
// System Prompt
// ============================================================================

function buildSystemPrompt(catalogSummary: string, sceneContext: string): string {
  return `You are an AI interior design agent for Aedifex, a 3D building/interior editor.
You help professional designers with building structure creation, furniture placement, layout optimization, and material selection.

## What You CAN Do

You can create and manage both **architectural structures** and **furniture**:
- **Walls** — Create walls with start/end points using \`add_wall\`
- **Doors** — Add doors to existing walls using \`add_door\`
- **Windows** — Add windows to existing walls using \`add_window\`
- **Furniture** — Add, move, remove furniture using \`add_item\`, \`move_item\`, \`remove_item\`
- **Remove any node** — Remove walls, doors, windows using \`remove_node\`

## What You CANNOT Do

The following are auto-generated and cannot be created by AI:
- **Zones/Rooms** — Auto-detected from wall boundaries
- **Slabs/Floors** — Auto-generated from zones
- **Ceilings/Roofs** — Auto-generated structural elements
- **Levels/Buildings/Sites** — Top-level scene hierarchy

When the user asks to create rooms: explain that you can create the walls, and zones will be automatically generated from the wall boundaries.

## Agent Behavior (CRITICAL)

You are an AGENT, not a simple tool executor. Think before acting:

1. **Analyze the space first.** Read the scene context carefully — understand zone boundaries, wall positions, room shape, and existing items before placing anything.
2. **Ask when uncertain.** If the user's request is ambiguous (e.g., "add a sofa" without specifying where in a large room with multiple possible locations), use the \`propose_placement\` tool to present 2-3 options with reasons. Let the user choose.
3. **Explain your reasoning.** Before using tool calls, briefly explain your spatial reasoning: which wall you're placing against, why you chose a specific position, how items relate to each other.
4. **Be proactive about conflicts.** If placing a new item would create a crowded layout or block a walkway, mention it and suggest alternatives.
5. **Respond in the same language as the user's message.**

### When to use propose_placement vs direct placement:
- **Direct placement (add_item/batch_operations):** When the request is specific ("put a sofa against the north wall") or the room has an obvious layout (small room, one clear arrangement).
- **propose_placement:** When there are multiple reasonable options (large room, user says "add a sofa" without location), or when it would be helpful to confirm before executing. Include 2-3 options with clear reasons for each.

## Your Tools

### Furniture Tools
1. **add_item**: Add furniture from the catalog
2. **remove_item**: Remove existing furniture by ID
3. **move_item**: Move/rotate existing furniture
4. **update_material**: Change material/color of items

### Architectural Tools
5. **add_wall**: Create a wall segment with start/end coordinates
6. **add_door**: Add a door to an existing wall
7. **add_window**: Add a window to an existing wall
8. **remove_node**: Remove any node (wall, door, window, item)

### Control Tools
9. **batch_operations**: Execute multiple operations at once
10. **propose_placement**: Present placement options to the user for confirmation
11. **ask_user**: Ask the user a clarifying question
12. **confirm_preview**: Confirm the current ghost preview
13. **reject_preview**: Reject the current ghost preview

## Agentic Loop
You operate in a loop: you call tools, receive execution results (including any position adjustments or validation errors), and can iterate. When you receive a tool_result:
- If operations were ADJUSTED (position shifted due to collision/bounds), review the adjustments and decide if another iteration is needed.
- If operations were INVALID (catalog not found, node doesn't exist), try a different approach or ask_user for clarification.
- If all operations were VALID, respond with a summary. The system will handle confirm/reject via UI buttons.
- You can call ask_user if you need clarification from the user before proceeding.

## Coordinate Rules
- Positions are in meters [x, y, z] where Y is up (Y=0 for floor items).
- rotationY is in radians (0 = default, π/2 = 90°, π = 180°, -π/2 = 270°).
- Wall coordinates use [x, z] for start/end points (2D floor plan).
- ONLY use items from the catalog below.

## Wall & Door/Window Coordinate System

### Wall Coordinates
- Walls are defined by \`start: [x, z]\` and \`end: [x, z]\` in world coordinates.
- Walls snap to a 0.5m grid. Minimum wall length is 0.5m.
- Default wall thickness is 0.2m, default height is 2.8m.
- When creating rooms, create walls that form a closed loop (end of one wall = start of next).

### Door/Window Placement (Wall-Local Coordinates)
- Doors and windows are placed ON existing walls using \`positionAlongWall\` (distance in meters from the wall start point).
- Example: A wall from (0,0) to (5,0) has length 5m. \`positionAlongWall: 2.5\` places the door at the wall's center.
- Doors default: width=0.9m, height=2.1m. Windows default: width=1.5m, height=1.5m.
- \`side\`: "front" or "back" — which side of the wall the door/window faces.
- Door-specific: \`hingesSide\` ("left"/"right"), \`swingDirection\` ("inward"/"outward").
- The system automatically clamps position to stay within wall bounds and checks for overlap with existing doors/windows.

### Creating a Room (Example)
To create a 5m × 4m room:
\`\`\`
add_wall: start=[0,0], end=[5,0]    // bottom wall
add_wall: start=[5,0], end=[5,4]    // right wall
add_wall: start=[5,4], end=[0,4]    // top wall
add_wall: start=[0,4], end=[0,0]    // left wall
add_door: wallId="<bottom-wall-id>", positionAlongWall=2.5  // door at center of bottom wall
add_window: wallId="<top-wall-id>", positionAlongWall=2.5   // window at center of top wall
\`\`\`
Note: After creating walls, zones are auto-detected. You can then furnish the room.

## Spatial Reasoning Guide

### How to Calculate Positions
1. **Read zone bounds** to know the room extents: min/max X and Z.
2. **Read wall positions** to know where walls are. Walls have start/end points and thickness.
3. **Against-wall placement:** Find the target wall, compute its normal direction, then place the item at: wall_surface + half_item_depth + 0.05m offset. Face the item toward room center (rotation = wall normal angle).
4. **Center placement:** For companion items (coffee table in front of sofa), compute the primary item's position + facing direction × ideal_distance.
5. **Always check bounds:** Ensure position ± half_dimensions stays within zone bounds.

### Spatial Rules
- **Against-wall items** (sofas, bookshelves, TV stands, desks, beds): Place flush against a wall, facing room center.
- **Center items** (coffee tables, dining tables): Place relative to their functional group, NOT at room center unless appropriate.
- **Companion spacing:** coffee table ↔ sofa: 0.3–0.5m; TV stand ↔ sofa: 2–3m; nightstand ↔ bed: 0m (adjacent); dining chair ↔ table: 0.5–0.6m.
- **Walkways:** Minimum 0.6m between furniture groups. 0.8–1.0m in front of doors/windows.
- **Rotation:** Items against a wall face AWAY from the wall. Facing items (sofa ↔ TV) have opposing rotations.

## Catalog
${catalogSummary}

## Current Scene
${sceneContext}
`
}

// ============================================================================
// OpenAI Tool Definitions
// ============================================================================

const OPENAI_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'add_item',
      description: 'Add a furniture item from the catalog to the scene. Use when you are confident about the placement.',
      parameters: {
        type: 'object',
        properties: {
          catalogSlug: {
            type: 'string',
            description: 'The catalog item ID (e.g., "sofa", "dining-table", "ceiling-lamp")',
          },
          position: {
            type: 'array',
            items: { type: 'number' },
            description: 'Position in meters [x, y, z]. Y is up (usually 0 for floor items). Calculate based on wall positions and zone bounds.',
          },
          rotationY: {
            type: 'number',
            description: 'Y-axis rotation in radians. Against-wall items should face away from wall.',
          },
          description: {
            type: 'string',
            description: 'Brief description of why this item was placed here.',
          },
        },
        required: ['catalogSlug', 'position', 'rotationY'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_item',
      description: 'Remove a furniture item from the scene.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: {
            type: 'string',
            description: 'The node ID of the item to remove.',
          },
          reason: {
            type: 'string',
            description: 'Brief reason for removing.',
          },
        },
        required: ['nodeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'move_item',
      description: 'Move or rotate an existing furniture item.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: {
            type: 'string',
            description: 'The node ID of the item to move.',
          },
          position: {
            type: 'array',
            items: { type: 'number' },
            description: 'New position in meters [x, y, z].',
          },
          rotationY: {
            type: 'number',
            description: 'New Y-axis rotation in radians.',
          },
          reason: {
            type: 'string',
            description: 'Brief reason for the move.',
          },
        },
        required: ['nodeId', 'position'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_material',
      description: 'Change the material/color of a furniture item.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: {
            type: 'string',
            description: 'The node ID of the item.',
          },
          material: {
            type: 'string',
            description: 'Material identifier or color value.',
          },
          reason: {
            type: 'string',
            description: 'Brief reason for the change.',
          },
        },
        required: ['nodeId', 'material'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_wall',
      description: 'Create a wall segment. Walls are defined by start and end coordinates in the floor plan (X-Z plane). Walls snap to 0.5m grid.',
      parameters: {
        type: 'object',
        properties: {
          start: {
            type: 'array',
            items: { type: 'number' },
            description: 'Start point [x, z] in meters.',
          },
          end: {
            type: 'array',
            items: { type: 'number' },
            description: 'End point [x, z] in meters.',
          },
          thickness: {
            type: 'number',
            description: 'Wall thickness in meters (default: 0.2).',
          },
          height: {
            type: 'number',
            description: 'Wall height in meters (default: 2.8).',
          },
          description: {
            type: 'string',
            description: 'Brief description of this wall.',
          },
        },
        required: ['start', 'end'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_door',
      description: 'Add a door to an existing wall. The door is positioned along the wall using positionAlongWall (meters from wall start). Requires a valid wallId.',
      parameters: {
        type: 'object',
        properties: {
          wallId: {
            type: 'string',
            description: 'The node ID of the wall to add the door to.',
          },
          positionAlongWall: {
            type: 'number',
            description: 'Position along the wall in meters from the start point. E.g., for a 5m wall, 2.5 places it at center.',
          },
          width: {
            type: 'number',
            description: 'Door width in meters (default: 0.9).',
          },
          height: {
            type: 'number',
            description: 'Door height in meters (default: 2.1).',
          },
          side: {
            type: 'string',
            enum: ['front', 'back'],
            description: 'Which side of the wall the door faces.',
          },
          hingesSide: {
            type: 'string',
            enum: ['left', 'right'],
            description: 'Which side the hinges are on.',
          },
          swingDirection: {
            type: 'string',
            enum: ['inward', 'outward'],
            description: 'Whether the door swings inward or outward.',
          },
          description: {
            type: 'string',
            description: 'Brief description.',
          },
        },
        required: ['wallId', 'positionAlongWall'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_window',
      description: 'Add a window to an existing wall. The window is positioned along the wall using positionAlongWall (meters from wall start). Requires a valid wallId.',
      parameters: {
        type: 'object',
        properties: {
          wallId: {
            type: 'string',
            description: 'The node ID of the wall to add the window to.',
          },
          positionAlongWall: {
            type: 'number',
            description: 'Position along the wall in meters from the start point.',
          },
          heightFromFloor: {
            type: 'number',
            description: 'Height of window center from floor in meters (default: 1.2).',
          },
          width: {
            type: 'number',
            description: 'Window width in meters (default: 1.5).',
          },
          height: {
            type: 'number',
            description: 'Window height in meters (default: 1.5).',
          },
          side: {
            type: 'string',
            enum: ['front', 'back'],
            description: 'Which side of the wall the window faces.',
          },
          description: {
            type: 'string',
            description: 'Brief description.',
          },
        },
        required: ['wallId', 'positionAlongWall'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_node',
      description: 'Remove any scene node (wall, door, window, or item). For removing furniture specifically, you can also use remove_item. This is more general and works with architectural elements too.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: {
            type: 'string',
            description: 'The node ID of the node to remove.',
          },
          reason: {
            type: 'string',
            description: 'Brief reason for removing.',
          },
        },
        required: ['nodeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'batch_operations',
      description: 'Execute multiple operations at once. Use for room creation (walls + doors + windows), room setups (furniture), style changes, or any multi-step operation.',
      parameters: {
        type: 'object',
        properties: {
          operations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['add_item', 'remove_item', 'move_item', 'update_material', 'add_wall', 'add_door', 'add_window', 'remove_node'],
                },
                catalogSlug: { type: 'string' },
                nodeId: { type: 'string' },
                position: { type: 'array', items: { type: 'number' } },
                rotationY: { type: 'number' },
                material: { type: 'string' },
                start: { type: 'array', items: { type: 'number' } },
                end: { type: 'array', items: { type: 'number' } },
                thickness: { type: 'number' },
                height: { type: 'number' },
                wallId: { type: 'string' },
                positionAlongWall: { type: 'number' },
                heightFromFloor: { type: 'number' },
                width: { type: 'number' },
                side: { type: 'string' },
                hingesSide: { type: 'string' },
                swingDirection: { type: 'string' },
                description: { type: 'string' },
                reason: { type: 'string' },
              },
            },
            description: 'Array of operations to execute.',
          },
          description: {
            type: 'string',
            description: 'Summary of what this batch does.',
          },
        },
        required: ['operations', 'description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_placement',
      description: 'Present 2-3 placement options to the user for confirmation. Use when there are multiple reasonable positions, or when you want to confirm before placing. The user will select an option and you will then execute it.',
      parameters: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: 'The question to ask the user (e.g., "I found 2 good spots for the sofa. Which do you prefer?")',
          },
          options: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                  description: 'Unique option ID (e.g., "A", "B", "C")',
                },
                label: {
                  type: 'string',
                  description: 'Short label (e.g., "Against the long wall")',
                },
                catalogSlug: {
                  type: 'string',
                  description: 'The catalog item to place.',
                },
                position: {
                  type: 'array',
                  items: { type: 'number' },
                  description: 'Proposed position [x, y, z].',
                },
                rotationY: {
                  type: 'number',
                  description: 'Proposed Y-axis rotation in radians.',
                },
                reason: {
                  type: 'string',
                  description: 'Why this position is recommended.',
                },
              },
              required: ['id', 'label', 'catalogSlug', 'position', 'rotationY', 'reason'],
            },
            description: '2-3 placement options for the user to choose from.',
          },
        },
        required: ['question', 'options'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ask_user',
      description: 'Ask the user a clarifying question when you need more information before proceeding. Use when the request is ambiguous or you need to confirm details.',
      parameters: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: 'The question to ask the user.',
          },
          suggestions: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional suggested responses for the user to choose from.',
          },
        },
        required: ['question'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'confirm_preview',
      description: 'Confirm and apply the current ghost preview. Use when the user explicitly agrees with the current preview state.',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description: 'Brief explanation of what is being confirmed.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reject_preview',
      description: 'Reject and discard the current ghost preview. Use when the user wants to undo/cancel the current preview.',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description: 'Brief explanation of why the preview is being rejected.',
          },
        },
      },
    },
  },
]

// ============================================================================
// API Route Handler
// ============================================================================

export async function POST(request: NextRequest) {
  if (!AI_API_KEY) {
    return NextResponse.json(
      { error: 'AI service not configured. AI_API_KEY is missing.' },
      { status: 503 },
    )
  }

  // Client identification for rate limiting (IP-based for Phase 1)
  const clientId = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'anonymous'
  const rateLimitCheck = checkRateLimit(clientId)
  if (!rateLimitCheck.allowed) {
    return NextResponse.json(
      { error: rateLimitCheck.reason },
      { status: 429 },
    )
  }

  let body: { messages: { role: string; content: string; tool_call_id?: string }[]; catalogSummary: string; sceneContext: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { messages, catalogSummary, sceneContext } = body
  if (!messages?.length || !catalogSummary || !sceneContext) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
  }

  const systemPrompt = buildSystemPrompt(catalogSummary, sceneContext)

  const openai = new OpenAI({
    apiKey: AI_API_KEY,
    baseURL: AI_BASE_URL,
  })

  try {
    const stream = await openai.chat.completions.create({
      model: AI_CHAT_MODEL,
      max_tokens: 4096,
      tools: OPENAI_TOOLS,
      stream: true,
      messages: [
        { role: 'system' as const, content: systemPrompt },
        ...messages.map((m) => {
          if (m.role === 'tool' && m.tool_call_id) {
            return {
              role: 'tool' as const,
              content: m.content,
              tool_call_id: m.tool_call_id,
            }
          }
          return {
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }
        }),
      ],
    })

    // Stream the response via SSE, forwarding OpenAI chunks to client
    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        let totalTokens = 0

        try {
          for await (const chunk of stream) {
            // Track token usage from usage field (appears in final chunk)
            if (chunk.usage) {
              totalTokens = chunk.usage.total_tokens ?? totalTokens
            }

            // Forward the chunk as SSE event
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
            )

            // Check for stream end
            const choice = chunk.choices?.[0]
            if (choice?.finish_reason) {
              // Record token usage for rate limiting
              recordTokenUsage(clientId, totalTokens)
            }
          }
        } catch (err) {
          console.error('Stream error:', err)
        } finally {
          controller.close()
        }
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (err) {
    const error = err as { status?: number; message?: string }

    if (error.status === 429) {
      return NextResponse.json(
        { error: 'AI service rate limited. Please try again in a moment.' },
        { status: 429 },
      )
    }

    console.error('OpenAI API error:', error.message)
    return NextResponse.json(
      { error: 'AI service error. Please try again.' },
      { status: 502 },
    )
  }
}
