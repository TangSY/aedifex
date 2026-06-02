// ============================================================================
// Building Templates
// Pre-defined building layouts for common architectural types.
// Used by the AI planner to generate structured plans for complex instructions.
// ============================================================================

export interface RoomTemplate {
  /** Room function name (English, used in plan output) */
  name: string
  /** Room dimensions in meters [width, depth] */
  size: [number, number]
  /** Suggested furniture items (catalogSlug keywords) */
  furniture: string[]
  /** Number of doors (0 = no door, decided by layout) */
  doors: number
  /** Number of windows */
  windows: number
}

export interface FloorTemplate {
  /** Floor level index (0 = ground) */
  level: number
  /** Floor label */
  label: string
  /** Rooms on this floor */
  rooms: RoomTemplate[]
  /** Floor height in meters */
  height: number
}

export interface BuildingTemplate {
  /** Template identifier */
  id: string
  /** Display name (English) */
  name: string
  /** Chinese name for matching user input */
  nameCN: string
  /** Description */
  description: string
  /** Number of floors */
  floors: FloorTemplate[]
  /** Total approximate footprint [width, depth] in meters */
  footprint: [number, number]
}

// ============================================================================
// Template Definitions
// ============================================================================

const TEMPLATES: BuildingTemplate[] = [
  // === 3-Story Villa ===
  {
    id: 'villa-3-story',
    name: '3-Story Villa',
    nameCN: '三层别墅',
    description: 'A spacious 3-story villa with living areas on ground floor, bedrooms on upper floors.',
    footprint: [12, 10],
    floors: [
      {
        level: 0,
        label: 'Ground Floor',
        height: 3.0,
        rooms: [
          { name: 'Living Room', size: [6, 5], furniture: ['sofa', 'coffee-table', 'tv-stand', 'floor-lamp'], doors: 1, windows: 2 },
          { name: 'Kitchen', size: [4, 4], furniture: ['kitchen-cabinet', 'refrigerator', 'dining-table', 'dining-chair'], doors: 1, windows: 1 },
          { name: 'Dining Room', size: [4, 5], furniture: ['dining-table', 'dining-chair', 'sideboard'], doors: 0, windows: 1 },
          { name: 'Bathroom', size: [2, 2.5], furniture: ['toilet', 'sink'], doors: 1, windows: 0 },
          { name: 'Entrance Hall', size: [3, 2], furniture: ['console', 'plant'], doors: 1, windows: 0 },
        ],
      },
      {
        level: 1,
        label: 'Second Floor',
        height: 3.0,
        rooms: [
          { name: 'Master Bedroom', size: [5, 5], furniture: ['bed', 'nightstand', 'wardrobe', 'dresser'], doors: 1, windows: 2 },
          { name: 'Bedroom 2', size: [4, 4], furniture: ['bed', 'nightstand', 'wardrobe', 'desk'], doors: 1, windows: 1 },
          { name: 'Bedroom 3', size: [4, 4], furniture: ['bed', 'nightstand', 'bookshelf'], doors: 1, windows: 1 },
          { name: 'Bathroom', size: [3, 2.5], furniture: ['toilet', 'sink', 'bathtub'], doors: 1, windows: 1 },
        ],
      },
      {
        level: 2,
        label: 'Third Floor',
        height: 2.8,
        rooms: [
          { name: 'Study', size: [5, 4], furniture: ['desk', 'office-chair', 'bookshelf', 'floor-lamp'], doors: 1, windows: 2 },
          { name: 'Guest Bedroom', size: [4, 4], furniture: ['bed', 'nightstand', 'wardrobe'], doors: 1, windows: 1 },
          { name: 'Storage', size: [3, 3], furniture: ['shelf', 'cabinet'], doors: 1, windows: 0 },
          { name: 'Balcony', size: [4, 2], furniture: ['plant'], doors: 1, windows: 0 },
        ],
      },
    ],
  },

  // === 2-Story Villa ===
  {
    id: 'villa-2-story',
    name: '2-Story Villa',
    nameCN: '两层别墅',
    description: 'A medium 2-story villa with open living space downstairs.',
    footprint: [10, 8],
    floors: [
      {
        level: 0,
        label: 'Ground Floor',
        height: 3.0,
        rooms: [
          { name: 'Living Room', size: [6, 5], furniture: ['sofa', 'coffee-table', 'tv-stand'], doors: 1, windows: 2 },
          { name: 'Kitchen', size: [4, 4], furniture: ['kitchen-cabinet', 'refrigerator', 'dining-table'], doors: 1, windows: 1 },
          { name: 'Bathroom', size: [2, 2.5], furniture: ['toilet', 'sink'], doors: 1, windows: 0 },
        ],
      },
      {
        level: 1,
        label: 'Second Floor',
        height: 2.8,
        rooms: [
          { name: 'Master Bedroom', size: [5, 5], furniture: ['bed', 'nightstand', 'wardrobe'], doors: 1, windows: 2 },
          { name: 'Bedroom 2', size: [4, 4], furniture: ['bed', 'nightstand', 'desk'], doors: 1, windows: 1 },
          { name: 'Bathroom', size: [2.5, 2.5], furniture: ['toilet', 'sink', 'bathtub'], doors: 1, windows: 1 },
        ],
      },
    ],
  },

  // === Studio Apartment ===
  {
    id: 'studio-apartment',
    name: 'Studio Apartment',
    nameCN: '开间公寓',
    description: 'A compact single-room apartment with combined living and sleeping area.',
    footprint: [6, 5],
    floors: [
      {
        level: 0,
        label: 'Main Floor',
        height: 2.8,
        rooms: [
          { name: 'Studio', size: [6, 5], furniture: ['bed', 'desk', 'wardrobe', 'sofa', 'coffee-table', 'bookshelf'], doors: 1, windows: 2 },
          { name: 'Bathroom', size: [2, 2], furniture: ['toilet', 'sink', 'shower'], doors: 1, windows: 0 },
          { name: 'Kitchenette', size: [2, 2], furniture: ['kitchen-cabinet', 'refrigerator'], doors: 0, windows: 0 },
        ],
      },
    ],
  },

  // === One-Bedroom Apartment ===
  {
    id: 'one-bedroom-apartment',
    name: 'One-Bedroom Apartment',
    nameCN: '一室一厅',
    description: 'A standard one-bedroom apartment with separate living and sleeping areas.',
    footprint: [8, 6],
    floors: [
      {
        level: 0,
        label: 'Main Floor',
        height: 2.8,
        rooms: [
          { name: 'Living Room', size: [4, 4], furniture: ['sofa', 'coffee-table', 'tv-stand'], doors: 1, windows: 1 },
          { name: 'Bedroom', size: [4, 4], furniture: ['bed', 'nightstand', 'wardrobe'], doors: 1, windows: 1 },
          { name: 'Kitchen', size: [3, 3], furniture: ['kitchen-cabinet', 'refrigerator', 'dining-table'], doors: 1, windows: 1 },
          { name: 'Bathroom', size: [2, 2.5], furniture: ['toilet', 'sink', 'shower'], doors: 1, windows: 0 },
        ],
      },
    ],
  },

  // === Two-Bedroom Apartment ===
  {
    id: 'two-bedroom-apartment',
    name: 'Two-Bedroom Apartment',
    nameCN: '两室一厅',
    description: 'A two-bedroom apartment for families.',
    footprint: [10, 7],
    floors: [
      {
        level: 0,
        label: 'Main Floor',
        height: 2.8,
        rooms: [
          { name: 'Living Room', size: [5, 4], furniture: ['sofa', 'coffee-table', 'tv-stand', 'floor-lamp'], doors: 1, windows: 1 },
          { name: 'Master Bedroom', size: [4, 4], furniture: ['bed', 'nightstand', 'wardrobe', 'dresser'], doors: 1, windows: 1 },
          { name: 'Bedroom 2', size: [3.5, 3.5], furniture: ['bed', 'nightstand', 'desk'], doors: 1, windows: 1 },
          { name: 'Kitchen', size: [3.5, 3], furniture: ['kitchen-cabinet', 'refrigerator'], doors: 1, windows: 1 },
          { name: 'Bathroom', size: [2.5, 2.5], furniture: ['toilet', 'sink', 'bathtub'], doors: 1, windows: 0 },
        ],
      },
    ],
  },

  // === Office Space ===
  {
    id: 'office-space',
    name: 'Office Space',
    nameCN: '办公室',
    description: 'A small office space with individual workstations and meeting area.',
    footprint: [10, 8],
    floors: [
      {
        level: 0,
        label: 'Main Floor',
        height: 2.8,
        rooms: [
          { name: 'Open Office', size: [6, 6], furniture: ['desk', 'office-chair', 'desk', 'office-chair', 'desk', 'office-chair', 'bookshelf'], doors: 1, windows: 3 },
          { name: 'Meeting Room', size: [4, 4], furniture: ['dining-table', 'dining-chair', 'dining-chair', 'dining-chair', 'dining-chair'], doors: 1, windows: 1 },
          { name: 'Manager Office', size: [3.5, 3.5], furniture: ['desk', 'office-chair', 'bookshelf', 'cabinet'], doors: 1, windows: 1 },
          { name: 'Pantry', size: [2.5, 2], furniture: ['kitchen-cabinet', 'refrigerator'], doors: 1, windows: 0 },
        ],
      },
    ],
  },

  // === Single Room ===
  {
    id: 'single-room',
    name: 'Single Room',
    nameCN: '单间',
    description: 'A single rectangular room. Useful as a starting point.',
    footprint: [5, 4],
    floors: [
      {
        level: 0,
        label: 'Main Floor',
        height: 2.8,
        rooms: [
          { name: 'Room', size: [5, 4], furniture: [], doors: 1, windows: 1 },
        ],
      },
    ],
  },
]

// ============================================================================
// Public API
// ============================================================================

/**
 * Find a matching building template by user input.
 * Matches against id, name, nameCN, and description keywords.
 */
export function findTemplate(userInput: string): BuildingTemplate | null {
  const input = userInput.toLowerCase()

  // Direct ID match
  const byId = TEMPLATES.find((t) => t.id === input)
  if (byId) return byId

  // Match by Chinese name
  const byCN = TEMPLATES.find((t) => input.includes(t.nameCN))
  if (byCN) return byCN

  // Match by English name keywords
  const byName = TEMPLATES.find((t) => input.includes(t.name.toLowerCase()))
  if (byName) return byName

  // Fuzzy matching by keywords
  const keywords: Record<string, string[]> = {
    'villa-3-story': ['三层', '3层', '3-story', '三楼', 'villa', '别墅'],
    'villa-2-story': ['两层', '2层', '2-story', '二楼', '二层别墅'],
    'studio-apartment': ['开间', 'studio', '单身公寓', '小公寓'],
    'one-bedroom-apartment': ['一室', '一房', '一居', 'one-bed', '1室'],
    'two-bedroom-apartment': ['两室', '两房', '两居', 'two-bed', '2室', '二室'],
    'office-space': ['办公', 'office', '工作室', '写字楼'],
    'single-room': ['单间', '房间', 'room', '一个房间'],
  }

  for (const [templateId, kws] of Object.entries(keywords)) {
    if (kws.some((kw) => input.includes(kw))) {
      return TEMPLATES.find((t) => t.id === templateId) ?? null
    }
  }

  return null
}

/**
 * Get all available template IDs and names for display.
 */
export function getAvailableTemplates(): { id: string; name: string; nameCN: string }[] {
  return TEMPLATES.map((t) => ({ id: t.id, name: t.name, nameCN: t.nameCN }))
}

/**
 * Generate a human-readable plan from a template.
 * This is injected into the AI's response when a complex instruction is detected.
 */
export function generatePlanFromTemplate(template: BuildingTemplate): string {
  const lines: string[] = []
  lines.push(`Building Plan: ${template.name} (${template.nameCN})`)
  lines.push(`Footprint: ${template.footprint[0]}m x ${template.footprint[1]}m`)
  lines.push('')

  for (const floor of template.floors) {
    lines.push(`## ${floor.label} (Level ${floor.level}, height: ${floor.height}m)`)
    for (const room of floor.rooms) {
      const furnitureStr = room.furniture.length > 0 ? room.furniture.join(', ') : 'empty'
      lines.push(`  - ${room.name}: ${room.size[0]}m x ${room.size[1]}m | Doors: ${room.doors}, Windows: ${room.windows} | Furniture: ${furnitureStr}`)
    }
    lines.push('')
  }

  lines.push(`Execution steps:`)
  for (let i = 0; i < template.floors.length; i++) {
    const floor = template.floors[i]!
    const stepBase = i * 3 + 1
    lines.push(`  Step ${stepBase}: Create Level ${floor.level} ${i > 0 ? `(add_level)` : '(already exists)'}`)
    lines.push(`  Step ${stepBase + 1}: Build walls, doors, and windows for ${floor.label}`)
    lines.push(`  Step ${stepBase + 2}: Place furniture in each room of ${floor.label}`)
  }
  lines.push(`  Final: Add stairs between levels and roof structure`)

  return lines.join('\n')
}

/**
 * Check if a user message likely requests a complex building that matches a template.
 * Returns the template if matched, null otherwise.
 */
export function detectBuildingRequest(userMessage: string): BuildingTemplate | null {
  // Check for multi-level indicators
  const multiLevelPatterns = [
    /(\d+)\s*层/, /(\d+)\s*story/i, /(\d+)\s*floor/i, /(\d+)\s*楼/,
    /别墅/, /villa/i, /公寓/, /apartment/i, /办公/, /office/i,
    /两室/, /三室/, /一室/, /开间/, /studio/i,
  ]

  const isComplexRequest = multiLevelPatterns.some((p) => p.test(userMessage))
  if (!isComplexRequest) return null

  return findTemplate(userMessage)
}
