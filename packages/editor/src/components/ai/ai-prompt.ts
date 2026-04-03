import type { ChatCompletionTool } from 'openai/resources/chat/completions'

// ============================================================================
// Summarize Prompt
// Shared between open-source editor and SaaS — single source of truth.
// ============================================================================

export const SUMMARIZE_SYSTEM_PROMPT = `You are a conversation summarizer for an AI interior design assistant.
Summarize the conversation history into a compact context that preserves:
1. Key design decisions made (what was added, removed, moved)
2. User preferences expressed (style, colors, layout preferences)
3. Current scene state changes
4. Any pending requests or follow-ups

Keep the summary under 500 words. Use bullet points. Respond in the same language as the conversation.`

// ============================================================================
// System Prompt Builder
// Shared between open-source editor and SaaS — single source of truth.
// ============================================================================

// ============================================================================
// Prompt Sections (modular, composable)
// Each section is a standalone string that can be independently tested.
// Inspired by Claude Code's buildEffectiveSystemPrompt pattern.
// ============================================================================

const CORE_IDENTITY = `You are an AI interior design agent for Aedifex, a 3D building/interior editor.
You help professional designers with building structure creation, furniture placement, layout optimization, and material selection.`

const CAPABILITIES = `## What You CAN Do

You can create and manage both **architectural structures** and **furniture**:
- **Walls** — Create walls with \`add_wall\`, modify height/thickness with \`update_wall\`
- **Doors** — Add doors with \`add_door\`, modify properties with \`update_door\`
- **Windows** — Add windows with \`add_window\`, modify properties with \`update_window\`
- **Furniture** — Add, move, remove furniture using \`add_item\`, \`move_item\`, \`remove_item\`
- **Remove any node** — Remove walls, doors, windows using \`remove_node\``

const LIMITATIONS = `## What You CANNOT Do (AI Tool Limitations)

The AI can operate on most scene elements. The following are the remaining limitations:
- **Zones/Rooms** can be manually created with \`add_zone\`, but zones are also auto-detected from wall boundaries.
- **Scans and Guides** require a URL to a 3D model or reference image — the AI cannot generate these assets, only place them.

### Multi-Level Building Workflow
To create a multi-story building:
1. Use \`add_building\` to create a building (comes with Level 0 automatically)
2. Use \`add_level\` to add additional floors
3. After adding a level, subsequent wall/door/window/item operations apply to the new level
4. Use \`add_slab\` to create floor plates between levels
5. Use \`add_ceiling\` for ceiling panels and \`add_roof\` for roof structures`

const AGENT_BEHAVIOR = `## Agent Behavior (CRITICAL)

You are an AGENT, not a simple tool executor. Think before acting:

1. **Analyze the space first.** Read the scene context carefully — understand zone boundaries, wall positions, room shape, and existing items before placing anything.
2. **Ask when uncertain.** If the user's request is ambiguous (e.g., "add a sofa" without specifying where in a large room with multiple possible locations), use the \`propose_placement\` tool to present 2-3 options with reasons. Let the user choose.
3. **Explain your reasoning.** Before using tool calls, briefly explain your spatial reasoning: which wall you're placing against, why you chose a specific position, how items relate to each other.
4. **Be proactive about conflicts.** If placing a new item would create a crowded layout or block a walkway, mention it and suggest alternatives.
5. **LANGUAGE RULE (MANDATORY — NO EXCEPTIONS):** You MUST respond in the EXACT same language as the user's CURRENT message. If the user writes in English, ALL your output MUST be in English — no Chinese mixed in. If the user writes in Chinese, ALL your output MUST be in Chinese — no English mixed in. This applies to explanations, tool descriptions, spatial reasoning, and summaries. Violating this rule is a critical error.
6. **Confirm before bulk destruction (MANDATORY).** When the user requests removing ALL or MOST items/walls (e.g., "删除所有", "清空房间", "remove everything", "把所有家具都删掉"), you MUST call \`ask_user\` FIRST to confirm. List exactly what will be removed (e.g., "将删除 3 面墙、2 扇门、5 件家具，确认吗？"). NEVER execute bulk removal without explicit user confirmation. Only single-item or ≤2 targeted removals may skip confirmation.
7. **Respect exact quantities.** When the user says "一个/a/one", add exactly 1. When they say "两个/two", add exactly 2. NEVER add more than requested. Do NOT silently add extras because you think the design needs them.
8. **Batch all related operations.** When you need to execute 2+ operations in one response (e.g., add multiple items, update multiple walls), ALWAYS use \`batch_operations\` instead of making separate tool calls. Each separate tool call triggers a new iteration, which is wasteful. One batch = one iteration.`

const INTERACTION_RULES = `### When to use propose_placement vs direct placement:
- **Direct placement (add_item/batch_operations):** When the request is specific ("put a sofa against the north wall") or the room has an obvious layout (small room, one clear arrangement).
- **propose_placement:** When there are multiple reasonable options (large room, user says "add a sofa" without location), or when it would be helpful to confirm before executing. Include 2-3 options with clear reasons for each.

## Catalog Shape/Variant Matching (CRITICAL)
When placing items, if the tool_result contains a shape warning (e.g., "User requested round variant, but closest available is Dining Table"), you MUST:
1. **Inform the user** about the mismatch — do NOT silently place a different variant.
2. **Explain what's available** and suggest alternatives or ask if they want to proceed.
3. Example: User says "放一张圆桌" but only rectangular table exists → tell user "目前只有长方形餐桌，没有圆桌模型。要用长方形的替代吗？"

## Agentic Loop
You operate in a loop: you call tools, receive execution results (including any position adjustments or validation errors), and can iterate. When you receive a tool_result:
- If operations were ADJUSTED (position shifted due to collision/bounds), review the adjustments and decide if another iteration is needed.
- If operations contain a **shape warning**, inform the user about the mismatch and ask for confirmation before proceeding.
- If operations were INVALID (catalog not found, node doesn't exist), try a different approach or ask_user for clarification.
- If all operations were VALID, respond with a summary. The system will show a ghost preview with confirm/reject UI buttons.
- You can call ask_user if you need clarification from the user before proceeding.

## Pending Preview Intent Recognition (CRITICAL)
When there is a pending ghost preview (operations waiting for user confirmation), the user's next message is an intent signal. You MUST interpret it correctly:

- **Confirm intent** — User agrees with the preview. Examples: "好", "确认", "可以", "行", "没问题", "就这样", "ok", "yes", "对", "嗯", "不错", "挺好", "就这个", "放这", etc. → Call \\\`confirm_preview\\\`.
- **Reject intent** — User wants to cancel/discard the preview. Examples: "不要", "取消", "算了", "撤销", "不行", "重来", "cancel", "no", "不好", "去掉", etc. → Call \\\`reject_preview\\\`.
- **Modify intent** — User wants changes to the current preview. Examples: "好的但是换个位置", "颜色换成白色", "往左移一点", "转个方向", etc. → Call \\\`reject_preview\\\` first, then execute new operations with the requested modifications.
- **Unrelated intent** — User asks something completely different. → Call \\\`reject_preview\\\` to clear the preview, then handle the new request normally.

NEVER ignore a pending preview. Always resolve it (confirm or reject) before proceeding with other operations.`

const COORDINATE_SYSTEM = `## Coordinate System
- Positions are in meters [x, y, z] where Y is up (Y=0 for floor items), XZ is the floor plane.
- **Cardinal directions: +X = East, -X = West, +Z = South, -Z = North.**
- **IMPORTANT: Z=0 is NORTH (not south). Larger Z values = more south. Smaller Z values = more north. Do NOT confuse this.**
- rotationY is in radians (0 = default, π/2 = 90°, π = 180°, -π/2 = 270°).
- Wall coordinates use [x, z] for start/end points (2D floor plan).
- ONLY use items from the catalog below.

## Furniture Orientation (CRITICAL)
The default model front faces **+Z direction** when rotationY=0.

**To calculate rotationY when placing furniture against a wall:**
1. Find the wall's inward normal (pointing INTO the room center):
   - Wall along +X direction (e.g. [0,0]→[5,0], north side, Z=0): inward normal = +Z → rotationY = 0
   - Wall along +Z direction (e.g. [5,0]→[5,4], east side, X=5): inward normal = -X → rotationY = π/2 (1.57)
   - Wall along -X direction (e.g. [5,4]→[0,4], south side, Z=4): inward normal = -Z → rotationY = π (3.14)
   - Wall along -Z direction (e.g. [0,4]→[0,0], west side, X=0): inward normal = +X → rotationY = -π/2 (-1.57)
2. Set rotationY so the furniture front faces the inward normal (toward room center).
3. Position the furniture flush against the wall: offset = wall_position ± item_depth/2.

**Note:** The system's layout optimizer automatically corrects orientation for against-wall items. If you provide a wrong rotationY, it will be auto-corrected to face the room center.

**Example:** For a sofa "against the south wall" (wall from [5,4] to [0,4], Z=4):
- The wall is at Z=4 (+Z = south), inward normal points -Z (toward room center)
- rotationY = π (3.14) — front faces -Z
- position Z = 4.0 - sofa_depth/2 - wall_thickness/2

## Wall & Door/Window Coordinate System

### Wall Coordinates
- Walls are defined by \\\`start: [x, z]\\\` and \\\`end: [x, z]\\\` in world coordinates.
- Walls can be at **any angle** — horizontal, vertical, or diagonal. Use this for triangular rooms, hexagonal rooms, angled corridors, etc.
- Walls snap to a 0.5m grid. Minimum wall length is 0.5m.
- Default wall thickness is 0.2m, default height is 2.8m.
- When creating rooms, create walls that form a closed loop (end of one wall = start of next).

### Door/Window Placement (Wall-Local Coordinates)
- Doors and windows are placed ON existing walls using \\\`positionAlongWall\\\` (distance in meters from the wall start point).
- Example: A wall from (0,0) to (5,0) has length 5m. \\\`positionAlongWall: 2.5\\\` places the door at the wall's center.
- Doors default: width=0.9m, height=2.1m. Windows default: width=1.5m, height=1.5m.
- \\\`side\\\`: "front" or "back" — which side of the wall the door/window faces.
- Door-specific: \\\`hingesSide\\\` ("left"/"right"), \\\`swingDirection\\\` ("inward"/"outward").
- The system automatically clamps position to stay within wall bounds and checks for overlap with existing doors/windows.

### Creating a Room (Example)
To create a 5m × 4m room:
\\\`\\\`\\\`
add_wall: start=[0,0], end=[5,0]    // bottom wall
add_wall: start=[5,0], end=[5,4]    // right wall
add_wall: start=[5,4], end=[0,4]    // top wall
add_wall: start=[0,4], end=[0,0]    // left wall
add_door: wallId="<bottom-wall-id>", positionAlongWall=2.5  // door at center of bottom wall
add_window: wallId="<top-wall-id>", positionAlongWall=2.5   // window at center of top wall
\\\`\\\`\\\`
Note: After creating walls, zones are auto-detected. You can then furnish the room.

### Extending / Reshaping Rooms (CRITICAL)
When extending an existing room or creating adjacent rooms that share a wall:
1. **First remove the shared wall** using \\\`remove_node\\\` — otherwise old and new walls will cross through each other.
2. **Then add new walls** that connect cleanly at endpoints.
3. **Migrate doors/windows** — if the removed wall had doors/windows, re-add them on the appropriate new wall.
4. The system will reject walls that cross through existing walls mid-segment. T-junctions (wall endpoint touching another wall) are allowed.

Example — extending a room eastward by removing the east wall:
\\\`\\\`\\\`
remove_node: nodeId="<east-wall-id>"      // remove shared wall
add_wall: start=[5,0], end=[8,0]           // new north extension
add_wall: start=[8,0], end=[8,4]           // new east wall
add_wall: start=[8,4], end=[5,4]           // new south extension
\\\`\\\`\\\``

const FURNITURE_RULES = `## Furniture Placement Rules
**IMPORTANT: Zone bounds = wall inner surfaces. "Against wall" means the item back edge touches the zone boundary — NO gap, NO additional offset. The system validator will prevent actual clipping automatically.**
- **TV stands, bookshelves, dressers, desks** → back edge flush with zone boundary (position = zone_bound ± item_depth/2)
- **Sofas** → back edge flush with zone boundary, front facing room center
- **Coffee tables** → in front of sofa, 0.4-0.6m clearance from sofa edge
- **Dining tables** → room center with ≥0.8m walking space around all sides
- **Beds** → headboard flush with zone boundary, side clearance ≥0.6m
- **Lamps/lighting** → near seating areas or corners

## Spatial Rules
- **Against-wall items** (sofas, bookshelves, TV stands, desks, beds): Item back edge = zone boundary. Do NOT add any gap — the validator handles micro-clearance.
- **Center items** (coffee tables, dining tables): Place relative to their functional group, NOT at room center unless appropriate.
- **Companion spacing:** coffee table ↔ sofa: 0.3–0.5m; TV stand ↔ sofa: 2–3m; nightstand ↔ bed: 0m (adjacent); dining chair ↔ table: 0.5–0.6m.
- **Walkways:** Minimum 0.6m between furniture groups. 0.8–1.0m in front of doors/windows.`

// ============================================================================
// Prompt Injection Sanitizer
// BUG FIX A-10: Strip common injection markers from user-supplied context strings
// before embedding them in the system prompt.
// ============================================================================

/**
 * Sanitize a string that will be embedded inside the system prompt.
 * Escapes/strips sequences that could be used to inject new instructions:
 * - Markdown heading prefixes (## / ###) that could introduce fake sections
 * - Common role-marker keywords at the start of a line (SYSTEM:, INSTRUCTIONS:, etc.)
 * - Bare "---" horizontal rules used to delimit new prompt blocks
 */
function sanitizePromptInjection(text: string): string {
  return text
    // Strip leading ## / ### headings (would create fake prompt sections)
    .replace(/^#{1,6}\s+/gm, '')
    // Strip SYSTEM: / INSTRUCTIONS: / ASSISTANT: / USER: at line start (case-insensitive)
    .replace(/^(SYSTEM|INSTRUCTIONS|ASSISTANT|USER)\s*:/gim, (match) => match.replace(':', '(colon)'))
    // Strip bare horizontal rules used as section delimiters
    .replace(/^---+\s*$/gm, '')
}

export function buildSystemPrompt(catalogSummary: string, sceneContext: string): string {
  const sanitizedSceneContext = sanitizePromptInjection(sceneContext)

  const sections = [
    CORE_IDENTITY,
    CAPABILITIES,
    LIMITATIONS,
    AGENT_BEHAVIOR,
    INTERACTION_RULES,
    COORDINATE_SYSTEM,
    FURNITURE_RULES,
    `## Catalog\n${catalogSummary}`,
    `## Current Scene\n${sanitizedSceneContext}`,
  ]

  return sections.join('\n\n')
}

// ============================================================================
// OpenAI Tool Definitions
// Shared between open-source editor and SaaS.
// ============================================================================

export const OPENAI_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'add_item',
      description: 'Add a furniture item from the catalog to the scene. Use when you are confident about the placement.',
      parameters: {
        type: 'object',
        properties: {
          catalogSlug: { type: 'string', description: 'The catalog item ID (e.g., "sofa", "dining-table", "ceiling-lamp")' },
          position: { type: 'array', items: { type: 'number' }, description: 'Position in meters [x, y, z]. Y is up (usually 0 for floor items).' },
          rotationY: { type: 'number', description: 'Y-axis rotation in radians. Against-wall items should face away from wall.' },
          description: { type: 'string', description: 'Brief description of why this item was placed here.' },
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
          nodeId: { type: 'string', description: 'The node ID of the item to remove.' },
          reason: { type: 'string', description: 'Brief reason for removing.' },
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
          nodeId: { type: 'string', description: 'The node ID of the item to move.' },
          position: { type: 'array', items: { type: 'number' }, description: 'New position in meters [x, y, z].' },
          rotationY: { type: 'number', description: 'New Y-axis rotation in radians.' },
          reason: { type: 'string', description: 'Brief reason for the move.' },
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
          nodeId: { type: 'string', description: 'The node ID of the item.' },
          material: { type: 'string', description: 'Material identifier or color value.' },
          reason: { type: 'string', description: 'Brief reason for the change.' },
        },
        required: ['nodeId', 'material'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_wall',
      description: 'Create a wall segment. Walls snap to 0.5m grid.',
      parameters: {
        type: 'object',
        properties: {
          start: { type: 'array', items: { type: 'number' }, description: 'Start point [x, z] in meters.' },
          end: { type: 'array', items: { type: 'number' }, description: 'End point [x, z] in meters.' },
          thickness: { type: 'number', description: 'Wall thickness in meters (default: 0.2).' },
          height: { type: 'number', description: 'Wall height in meters (default: 2.8).' },
          description: { type: 'string', description: 'Brief description of this wall.' },
        },
        required: ['start', 'end'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_door',
      description: 'Add a door to an existing wall. Positioned using positionAlongWall (meters from wall start).',
      parameters: {
        type: 'object',
        properties: {
          wallId: { type: 'string', description: 'The node ID of the wall.' },
          positionAlongWall: { type: 'number', description: 'Position along wall in meters from start.' },
          width: { type: 'number', description: 'Door width in meters (default: 0.9).' },
          height: { type: 'number', description: 'Door height in meters (default: 2.1).' },
          side: { type: 'string', enum: ['front', 'back'], description: 'Which side of the wall the door faces.' },
          hingesSide: { type: 'string', enum: ['left', 'right'], description: 'Which side the hinges are on.' },
          swingDirection: { type: 'string', enum: ['inward', 'outward'], description: 'Door swing direction.' },
          description: { type: 'string', description: 'Brief description.' },
        },
        required: ['wallId', 'positionAlongWall'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_window',
      description: 'Add a window to an existing wall. Positioned using positionAlongWall (meters from wall start).',
      parameters: {
        type: 'object',
        properties: {
          wallId: { type: 'string', description: 'The node ID of the wall.' },
          positionAlongWall: { type: 'number', description: 'Position along wall in meters from start.' },
          heightFromFloor: { type: 'number', description: 'Height of window center from floor (default: 1.2).' },
          width: { type: 'number', description: 'Window width in meters (default: 1.5).' },
          height: { type: 'number', description: 'Window height in meters (default: 1.5).' },
          side: { type: 'string', enum: ['front', 'back'], description: 'Which side of the wall the window faces.' },
          description: { type: 'string', description: 'Brief description.' },
        },
        required: ['wallId', 'positionAlongWall'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_wall',
      description: 'Update properties of an existing wall (height, thickness, start/end points). Preserves all doors and windows on the wall.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'The node ID of the wall to update.' },
          height: { type: 'number', description: 'New wall height in meters.' },
          thickness: { type: 'number', description: 'New wall thickness in meters.' },
          start: { type: 'array', items: { type: 'number' }, description: 'New start point [x, z] in meters.' },
          end: { type: 'array', items: { type: 'number' }, description: 'New end point [x, z] in meters.' },
          reason: { type: 'string', description: 'Brief reason for the change.' },
        },
        required: ['nodeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_door',
      description: 'Update properties of an existing door (width, height, position, swing). Preserves the door on its wall.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'The node ID of the door to update.' },
          width: { type: 'number', description: 'New door width in meters.' },
          height: { type: 'number', description: 'New door height in meters.' },
          positionAlongWall: { type: 'number', description: 'New position along wall in meters from start.' },
          side: { type: 'string', enum: ['front', 'back'], description: 'Which side of the wall the door faces.' },
          hingesSide: { type: 'string', enum: ['left', 'right'], description: 'Which side the hinges are on.' },
          swingDirection: { type: 'string', enum: ['inward', 'outward'], description: 'Door swing direction.' },
          reason: { type: 'string', description: 'Brief reason for the change.' },
        },
        required: ['nodeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_window',
      description: 'Update properties of an existing window (width, height, position).',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'The node ID of the window to update.' },
          width: { type: 'number', description: 'New window width in meters.' },
          height: { type: 'number', description: 'New window height in meters.' },
          positionAlongWall: { type: 'number', description: 'New position along wall in meters from start.' },
          heightFromFloor: { type: 'number', description: 'Height of window center from floor.' },
          side: { type: 'string', enum: ['front', 'back'], description: 'Which side of the wall the window faces.' },
          reason: { type: 'string', description: 'Brief reason for the change.' },
        },
        required: ['nodeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_node',
      description: 'Remove any scene node (wall, door, window, or item).',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'The node ID to remove.' },
          reason: { type: 'string', description: 'Brief reason for removing.' },
        },
        required: ['nodeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_level',
      description: 'Create a new level (floor) in the current building. The level number is auto-incremented. After creation, subsequent operations apply to this new level.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Optional name for the level (e.g., "Second Floor").' },
          description: { type: 'string', description: 'Brief description.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_slab',
      description: 'Create a floor slab (horizontal plate) from a polygon. Used for multi-level buildings to define floor plates.',
      parameters: {
        type: 'object',
        properties: {
          polygon: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: 'Boundary polygon as array of [x, z] points in meters.' },
          elevation: { type: 'number', description: 'Slab elevation (Y position) in meters (default: 0.05).' },
          holes: { type: 'array', items: { type: 'array', items: { type: 'array', items: { type: 'number' } } }, description: 'Optional holes in the slab as arrays of [x, z] polygons.' },
          description: { type: 'string', description: 'Brief description.' },
        },
        required: ['polygon'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_slab',
      description: 'Update properties of an existing slab (elevation, polygon).',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'The node ID of the slab to update.' },
          elevation: { type: 'number', description: 'New slab elevation in meters.' },
          polygon: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: 'New boundary polygon as array of [x, z] points.' },
          reason: { type: 'string', description: 'Brief reason for the change.' },
        },
        required: ['nodeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_ceiling',
      description: "Create a flat ceiling panel from a polygon. Typically covers a room or zone boundary. polygon is optional — if omitted, the system will automatically use the active zone's boundary.",
      parameters: {
        type: 'object',
        properties: {
          polygon: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: 'Ceiling boundary polygon as array of [x, z] points in meters. Optional — if omitted, the system auto-detects from the active zone boundary.' },
          height: { type: 'number', description: 'Ceiling height in meters (default: 2.5).' },
          material: { type: 'string', description: 'Material identifier or color value.' },
          description: { type: 'string', description: 'Brief description.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_ceiling',
      description: 'Update properties of an existing ceiling (height, material).',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'The node ID of the ceiling to update.' },
          height: { type: 'number', description: 'New ceiling height in meters.' },
          material: { type: 'string', description: 'New material identifier or color value.' },
          reason: { type: 'string', description: 'Brief reason for the change.' },
        },
        required: ['nodeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_roof',
      description: 'Create a roof structure. Supports 7 types: hip, gable, shed, gambrel, dutch, mansard, flat. Creates a RoofNode container with one RoofSegment inside.',
      parameters: {
        type: 'object',
        properties: {
          position: { type: 'array', items: { type: 'number' }, description: 'Center position [x, y, z] in meters.' },
          width: { type: 'number', description: 'Roof width in meters.' },
          depth: { type: 'number', description: 'Roof depth in meters.' },
          roofType: { type: 'string', enum: ['hip', 'gable', 'shed', 'gambrel', 'dutch', 'mansard', 'flat'], description: 'Type of roof.' },
          roofHeight: { type: 'number', description: 'Roof peak height in meters (default: 2.5).' },
          wallHeight: { type: 'number', description: 'Wall height below roof in meters (default: 0.5).' },
          overhang: { type: 'number', description: 'Eave overhang in meters (default: 0.3).' },
          description: { type: 'string', description: 'Brief description.' },
        },
        required: ['position', 'width', 'depth', 'roofType'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_roof',
      description: 'Update properties of an existing roof segment (type, dimensions).',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'The node ID of the roof segment to update.' },
          roofType: { type: 'string', enum: ['hip', 'gable', 'shed', 'gambrel', 'dutch', 'mansard', 'flat'], description: 'New roof type.' },
          roofHeight: { type: 'number', description: 'New roof peak height in meters.' },
          wallHeight: { type: 'number', description: 'New wall height in meters.' },
          width: { type: 'number', description: 'New width in meters.' },
          depth: { type: 'number', description: 'New depth in meters.' },
          reason: { type: 'string', description: 'Brief reason for the change.' },
        },
        required: ['nodeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_zone',
      description: 'Manually create a room/zone from a polygon. Zones are usually auto-detected from walls, but this allows manual zone creation.',
      parameters: {
        type: 'object',
        properties: {
          polygon: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: 'Zone boundary polygon as array of [x, z] points in meters.' },
          name: { type: 'string', description: 'Zone name (e.g., "Living Room", "Kitchen").' },
          description: { type: 'string', description: 'Brief description.' },
        },
        required: ['polygon'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_zone',
      description: 'Update properties of an existing zone (polygon, name).',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'The node ID of the zone to update.' },
          polygon: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: 'New boundary polygon as array of [x, z] points.' },
          name: { type: 'string', description: 'New zone name.' },
          reason: { type: 'string', description: 'Brief reason for the change.' },
        },
        required: ['nodeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_building',
      description: 'Create a new building in the scene. Automatically includes Level 0. Use when the scene needs multiple separate buildings.',
      parameters: {
        type: 'object',
        properties: {
          position: { type: 'array', items: { type: 'number' }, description: 'Building position [x, y, z] in meters (default: [0, 0, 0]).' },
          name: { type: 'string', description: 'Building name.' },
          description: { type: 'string', description: 'Brief description.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_site',
      description: 'Update the site boundary polygon.',
      parameters: {
        type: 'object',
        properties: {
          polygon: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: 'New site boundary polygon as array of [x, z] points in meters.' },
          reason: { type: 'string', description: 'Brief reason for the change.' },
        },
        required: ['polygon'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_scan',
      description: 'Add a 3D scan or reference model to the scene.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to the 3D model file.' },
          position: { type: 'array', items: { type: 'number' }, description: 'Position [x, y, z] in meters (default: [0, 0, 0]).' },
          scale: { type: 'number', description: 'Uniform scale factor (default: 1).' },
          opacity: { type: 'number', description: 'Opacity 0-1 (default: 0.5).' },
          description: { type: 'string', description: 'Brief description.' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_guide',
      description: 'Add a reference guide (floor plan image or guide overlay) to the scene.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to the guide image or model file.' },
          position: { type: 'array', items: { type: 'number' }, description: 'Position [x, y, z] in meters (default: [0, 0, 0]).' },
          scale: { type: 'number', description: 'Uniform scale factor (default: 1).' },
          opacity: { type: 'number', description: 'Opacity 0-1 (default: 0.5).' },
          description: { type: 'string', description: 'Brief description.' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_item',
      description: 'Update properties of an existing furniture item (scale). Use move_item for position changes.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'The node ID of the item to update.' },
          scale: { type: 'array', items: { type: 'number' }, description: 'New scale [x, y, z] (e.g., [1.5, 1.5, 1.5] for 150%).' },
          reason: { type: 'string', description: 'Brief reason for the change.' },
        },
        required: ['nodeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'batch_operations',
      description: 'Execute multiple operations at once. Use for room creation, room setups, or any multi-step operation.',
      parameters: {
        type: 'object',
        properties: {
          operations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['add_item', 'remove_item', 'move_item', 'update_material', 'update_item', 'add_wall', 'update_wall', 'add_door', 'update_door', 'add_window', 'update_window', 'remove_node', 'add_level', 'add_slab', 'update_slab', 'add_ceiling', 'update_ceiling', 'add_roof', 'update_roof', 'add_zone', 'update_zone', 'add_building', 'update_site', 'add_scan', 'add_guide'] },
                catalogSlug: { type: 'string' }, nodeId: { type: 'string' },
                position: { type: 'array', items: { type: 'number' } }, rotationY: { type: 'number' },
                material: { type: 'string' },
                start: { type: 'array', items: { type: 'number' } }, end: { type: 'array', items: { type: 'number' } },
                thickness: { type: 'number' }, height: { type: 'number' },
                wallId: { type: 'string' }, positionAlongWall: { type: 'number' }, heightFromFloor: { type: 'number' },
                width: { type: 'number' }, side: { type: 'string' }, hingesSide: { type: 'string' }, swingDirection: { type: 'string' },
                description: { type: 'string' }, reason: { type: 'string' },
              },
            },
          },
          description: { type: 'string', description: 'Summary of what this batch does.' },
        },
        required: ['operations', 'description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_placement',
      description: 'Present 2-3 placement options to the user for confirmation.',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'The question to ask the user.' },
          options: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' }, label: { type: 'string' }, catalogSlug: { type: 'string' },
                position: { type: 'array', items: { type: 'number' } }, rotationY: { type: 'number' },
                reason: { type: 'string' },
              },
              required: ['id', 'label', 'catalogSlug', 'position', 'rotationY', 'reason'],
            },
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
      description: 'Ask the user a clarifying question when the request is ambiguous.',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'The question to ask.' },
          suggestions: { type: 'array', items: { type: 'string' }, description: 'Optional suggested responses.' },
        },
        required: ['question'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'confirm_preview',
      description: 'Confirm and apply the current ghost preview.',
      parameters: { type: 'object', properties: { reason: { type: 'string' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reject_preview',
      description: 'Reject and discard the current ghost preview.',
      parameters: { type: 'object', properties: { reason: { type: 'string' } } },
    },
  },
]
