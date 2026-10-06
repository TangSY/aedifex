// ============================================================================
// Room Analyzer
// Infers room function from existing furniture and suggests missing items.
// Used to enrich AI scene context with semantic room information.
// ============================================================================

import { getPlacementMeta } from './furniture-placement-metadata'

// ============================================================================
// Room Type Definitions
// ============================================================================

export type RoomType =
  | 'living-room'
  | 'bedroom'
  | 'kitchen'
  | 'bathroom'
  | 'office'
  | 'dining-room'
  | 'storage'
  | 'unknown'

interface RoomTypeSignature {
  /** Keywords in item slug/category that indicate this room type */
  indicators: string[]
  /** Minimum number of indicator matches to classify */
  minMatches: number
  /** Standard furniture for a complete room of this type */
  standardFurniture: string[]
  /** Display name */
  label: string
  labelCN: string
}

const ROOM_SIGNATURES: Record<RoomType, RoomTypeSignature> = {
  'living-room': {
    indicators: ['sofa', 'couch', 'tv-stand', 'tv-cabinet', 'coffee-table', 'entertainment'],
    minMatches: 1,
    standardFurniture: ['sofa', 'coffee-table', 'tv-stand', 'floor-lamp', 'rug'],
    label: 'Living Room',
    labelCN: '客厅',
  },
  'bedroom': {
    indicators: ['bed', 'nightstand', 'bedside', 'wardrobe', 'dresser', 'vanity'],
    minMatches: 1,
    standardFurniture: ['bed', 'nightstand', 'wardrobe', 'lamp'],
    label: 'Bedroom',
    labelCN: '卧室',
  },
  'kitchen': {
    indicators: ['kitchen', 'refrigerator', 'fridge', 'stove', 'oven', 'microwave'],
    minMatches: 1,
    standardFurniture: ['kitchen-cabinet', 'refrigerator', 'stove'],
    label: 'Kitchen',
    labelCN: '厨房',
  },
  'bathroom': {
    indicators: ['toilet', 'bathtub', 'shower', 'sink'],
    minMatches: 1,
    standardFurniture: ['toilet', 'sink'],
    label: 'Bathroom',
    labelCN: '卫生间',
  },
  'office': {
    indicators: ['desk', 'office-chair', 'monitor'],
    minMatches: 2,
    standardFurniture: ['desk', 'office-chair', 'bookshelf', 'lamp'],
    label: 'Office',
    labelCN: '书房/办公室',
  },
  'dining-room': {
    indicators: ['dining-table', 'dining-chair', 'buffet', 'hutch'],
    minMatches: 1,
    standardFurniture: ['dining-table', 'dining-chair'],
    label: 'Dining Room',
    labelCN: '餐厅',
  },
  'storage': {
    indicators: ['shelf', 'cabinet', 'storage'],
    minMatches: 2,
    standardFurniture: ['shelf', 'cabinet'],
    label: 'Storage',
    labelCN: '储物间',
  },
  'unknown': {
    indicators: [],
    minMatches: 999,
    standardFurniture: [],
    label: 'Room',
    labelCN: '房间',
  },
}

// ============================================================================
// Room Analysis
// ============================================================================

export interface RoomAnalysis {
  /** Inferred room type */
  type: RoomType
  /** Confidence: number of indicator matches */
  confidence: number
  /** Display labels */
  label: string
  labelCN: string
  /** Items currently in the room (slug list) */
  existingItems: string[]
  /** Suggested missing items for a complete room */
  missingItems: string[]
}

/**
 * Analyze a set of items to infer room type and suggest missing furniture.
 * @param items Array of { catalogSlug, category } for items in a zone
 * @param maxItems Cap on items to analyze (performance guard)
 */
export function analyzeRoom(
  items: { catalogSlug: string; category?: string }[],
  maxItems: number = 50,
): RoomAnalysis {
  const capped = items.slice(0, maxItems)
  const slugs = capped.map((i) => i.catalogSlug.toLowerCase())

  // Score each room type
  let bestType: RoomType = 'unknown'
  let bestScore = 0

  for (const [type, sig] of Object.entries(ROOM_SIGNATURES) as [RoomType, RoomTypeSignature][]) {
    if (type === 'unknown') continue
    const matches = sig.indicators.filter((ind) =>
      slugs.some((slug) => slug.includes(ind))
    ).length
    if (matches >= sig.minMatches && matches > bestScore) {
      bestScore = matches
      bestType = type
    }
  }

  const sig = ROOM_SIGNATURES[bestType]

  // Find missing standard furniture
  const missingItems = sig.standardFurniture.filter((standard) =>
    !slugs.some((slug) => slug.includes(standard))
  )

  return {
    type: bestType,
    confidence: bestScore,
    label: sig.label,
    labelCN: sig.labelCN,
    existingItems: slugs,
    missingItems,
  }
}

/**
 * Generate a concise room analysis string for AI scene context.
 * Returns empty string if room type is unknown.
 */
export function formatRoomAnalysis(analysis: RoomAnalysis): string {
  if (analysis.type === 'unknown') return ''

  const parts: string[] = [
    `Room type: ${analysis.label} (${analysis.labelCN})`,
  ]

  if (analysis.missingItems.length > 0) {
    parts.push(`Missing standard items: ${analysis.missingItems.join(', ')}`)
  } else {
    parts.push('Room is fully furnished.')
  }

  return parts.join('. ')
}

// Re-export getPlacementMeta for convenience
export { getPlacementMeta }
