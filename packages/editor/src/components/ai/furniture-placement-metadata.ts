// ============================================================================
// Furniture Placement Metadata
// Structured semantic data for AI-driven furniture placement.
// Replaces hardcoded string lists with rich per-category metadata.
// ============================================================================

export type PlacementType = 'against-wall' | 'center' | 'corner' | 'floating'
export type PreferredOrientation = 'face-room' | 'face-wall' | 'any'

export interface FurniturePlacementMeta {
  /** How the item should be positioned relative to walls/room */
  placementType: PlacementType
  /** Which direction the item should face */
  preferredOrientation: PreferredOrientation
  /** Functional group this item belongs to (e.g., sofa belongs to 'living-seating') */
  functionalGroup?: string
  /** Items this typically pairs with (e.g., coffee-table pairs with sofa) */
  companionOf?: string[]
  /** Minimum clearance in meters { front, back, left, right } */
  minClearance: { front: number; back: number; left: number; right: number }
}

// ============================================================================
// Metadata Registry
// Key: category keyword matched against catalogSlug or asset.category
// ============================================================================

const PLACEMENT_METADATA: Record<string, FurniturePlacementMeta> = {
  // === Living Room — Seating ===
  'sofa': {
    placementType: 'against-wall',
    preferredOrientation: 'face-room',
    functionalGroup: 'living-seating',
    companionOf: ['coffee-table', 'side-table'],
    minClearance: { front: 0.8, back: 0, left: 0.1, right: 0.1 },
  },
  'couch': {
    placementType: 'against-wall',
    preferredOrientation: 'face-room',
    functionalGroup: 'living-seating',
    companionOf: ['coffee-table', 'side-table'],
    minClearance: { front: 0.8, back: 0, left: 0.1, right: 0.1 },
  },
  'armchair': {
    placementType: 'floating',
    preferredOrientation: 'any',
    functionalGroup: 'living-seating',
    minClearance: { front: 0.6, back: 0.1, left: 0.1, right: 0.1 },
  },

  // === Living Room — Tables ===
  'coffee-table': {
    placementType: 'center',
    preferredOrientation: 'any',
    functionalGroup: 'living-seating',
    companionOf: ['sofa', 'couch'],
    minClearance: { front: 0.3, back: 0.3, left: 0.3, right: 0.3 },
  },
  'tea-table': {
    placementType: 'center',
    preferredOrientation: 'any',
    functionalGroup: 'living-seating',
    companionOf: ['sofa', 'couch'],
    minClearance: { front: 0.3, back: 0.3, left: 0.3, right: 0.3 },
  },
  'side-table': {
    placementType: 'floating',
    preferredOrientation: 'any',
    functionalGroup: 'living-seating',
    companionOf: ['sofa', 'armchair'],
    minClearance: { front: 0.2, back: 0.2, left: 0.2, right: 0.2 },
  },

  // === Living Room — Entertainment ===
  'tv-stand': {
    placementType: 'against-wall',
    preferredOrientation: 'face-room',
    functionalGroup: 'entertainment',
    companionOf: ['sofa', 'couch'],
    minClearance: { front: 2.0, back: 0, left: 0.1, right: 0.1 },
  },
  'tv-cabinet': {
    placementType: 'against-wall',
    preferredOrientation: 'face-room',
    functionalGroup: 'entertainment',
    companionOf: ['sofa', 'couch'],
    minClearance: { front: 2.0, back: 0, left: 0.1, right: 0.1 },
  },
  'entertainment-center': {
    placementType: 'against-wall',
    preferredOrientation: 'face-room',
    functionalGroup: 'entertainment',
    minClearance: { front: 2.0, back: 0, left: 0.1, right: 0.1 },
  },

  // === Dining ===
  'dining-table': {
    placementType: 'center',
    preferredOrientation: 'any',
    functionalGroup: 'dining',
    companionOf: ['dining-chair', 'chair'],
    minClearance: { front: 0.8, back: 0.8, left: 0.8, right: 0.8 },
  },
  'dining-chair': {
    placementType: 'floating',
    preferredOrientation: 'any',
    functionalGroup: 'dining',
    companionOf: ['dining-table'],
    minClearance: { front: 0.5, back: 0.1, left: 0.05, right: 0.05 },
  },

  // === Bedroom ===
  'bed': {
    placementType: 'against-wall',
    preferredOrientation: 'face-room',
    functionalGroup: 'bedroom',
    companionOf: ['nightstand', 'bedside'],
    minClearance: { front: 0.8, back: 0, left: 0.6, right: 0.6 },
  },
  'nightstand': {
    placementType: 'floating',
    preferredOrientation: 'any',
    functionalGroup: 'bedroom',
    companionOf: ['bed'],
    minClearance: { front: 0.1, back: 0, left: 0, right: 0 },
  },
  'bedside': {
    placementType: 'floating',
    preferredOrientation: 'any',
    functionalGroup: 'bedroom',
    companionOf: ['bed'],
    minClearance: { front: 0.1, back: 0, left: 0, right: 0 },
  },
  'wardrobe': {
    placementType: 'against-wall',
    preferredOrientation: 'face-room',
    functionalGroup: 'bedroom',
    minClearance: { front: 0.8, back: 0, left: 0.05, right: 0.05 },
  },
  'dresser': {
    placementType: 'against-wall',
    preferredOrientation: 'face-room',
    functionalGroup: 'bedroom',
    minClearance: { front: 0.6, back: 0, left: 0.05, right: 0.05 },
  },
  'vanity': {
    placementType: 'against-wall',
    preferredOrientation: 'face-wall',
    functionalGroup: 'bedroom',
    minClearance: { front: 0.6, back: 0, left: 0.1, right: 0.1 },
  },

  // === Office / Study ===
  'desk': {
    placementType: 'against-wall',
    preferredOrientation: 'face-wall',
    functionalGroup: 'office',
    companionOf: ['office-chair', 'chair'],
    minClearance: { front: 0.8, back: 0, left: 0.1, right: 0.1 },
  },
  'office-chair': {
    placementType: 'floating',
    preferredOrientation: 'any',
    functionalGroup: 'office',
    companionOf: ['desk'],
    minClearance: { front: 0.5, back: 0.3, left: 0.1, right: 0.1 },
  },

  // === Storage ===
  'bookshelf': {
    placementType: 'against-wall',
    preferredOrientation: 'face-room',
    minClearance: { front: 0.6, back: 0, left: 0.05, right: 0.05 },
  },
  'bookcase': {
    placementType: 'against-wall',
    preferredOrientation: 'face-room',
    minClearance: { front: 0.6, back: 0, left: 0.05, right: 0.05 },
  },
  'cabinet': {
    placementType: 'against-wall',
    preferredOrientation: 'face-room',
    minClearance: { front: 0.6, back: 0, left: 0.05, right: 0.05 },
  },
  'sideboard': {
    placementType: 'against-wall',
    preferredOrientation: 'face-room',
    minClearance: { front: 0.4, back: 0, left: 0.05, right: 0.05 },
  },
  'console': {
    placementType: 'against-wall',
    preferredOrientation: 'face-room',
    minClearance: { front: 0.4, back: 0, left: 0.05, right: 0.05 },
  },
  'shelf': {
    placementType: 'against-wall',
    preferredOrientation: 'face-room',
    minClearance: { front: 0.4, back: 0, left: 0.05, right: 0.05 },
  },
  'credenza': {
    placementType: 'against-wall',
    preferredOrientation: 'face-room',
    minClearance: { front: 0.4, back: 0, left: 0.05, right: 0.05 },
  },
  'buffet': {
    placementType: 'against-wall',
    preferredOrientation: 'face-room',
    functionalGroup: 'dining',
    minClearance: { front: 0.6, back: 0, left: 0.05, right: 0.05 },
  },
  'hutch': {
    placementType: 'against-wall',
    preferredOrientation: 'face-room',
    minClearance: { front: 0.6, back: 0, left: 0.05, right: 0.05 },
  },
  'armoire': {
    placementType: 'against-wall',
    preferredOrientation: 'face-room',
    minClearance: { front: 0.8, back: 0, left: 0.05, right: 0.05 },
  },

  // === Kitchen ===
  'kitchen-island': {
    placementType: 'center',
    preferredOrientation: 'any',
    functionalGroup: 'kitchen',
    minClearance: { front: 0.9, back: 0.9, left: 0.9, right: 0.9 },
  },
  'kitchen-cabinet': {
    placementType: 'against-wall',
    preferredOrientation: 'face-room',
    functionalGroup: 'kitchen',
    minClearance: { front: 0.9, back: 0, left: 0, right: 0 },
  },
  'refrigerator': {
    placementType: 'against-wall',
    preferredOrientation: 'face-room',
    functionalGroup: 'kitchen',
    minClearance: { front: 0.9, back: 0, left: 0.05, right: 0.05 },
  },
  'fridge': {
    placementType: 'against-wall',
    preferredOrientation: 'face-room',
    functionalGroup: 'kitchen',
    minClearance: { front: 0.9, back: 0, left: 0.05, right: 0.05 },
  },
  'stove': {
    placementType: 'against-wall',
    preferredOrientation: 'face-room',
    functionalGroup: 'kitchen',
    minClearance: { front: 0.9, back: 0, left: 0.1, right: 0.1 },
  },
  'oven': {
    placementType: 'against-wall',
    preferredOrientation: 'face-room',
    functionalGroup: 'kitchen',
    minClearance: { front: 0.9, back: 0, left: 0.1, right: 0.1 },
  },

  // === Bathroom ===
  'toilet': {
    placementType: 'against-wall',
    preferredOrientation: 'face-room',
    functionalGroup: 'bathroom',
    minClearance: { front: 0.6, back: 0, left: 0.2, right: 0.2 },
  },
  'sink': {
    placementType: 'against-wall',
    preferredOrientation: 'face-wall',
    functionalGroup: 'bathroom',
    minClearance: { front: 0.6, back: 0, left: 0.1, right: 0.1 },
  },
  'bathtub': {
    placementType: 'against-wall',
    preferredOrientation: 'any',
    functionalGroup: 'bathroom',
    minClearance: { front: 0.6, back: 0, left: 0.1, right: 0.1 },
  },
  'shower': {
    placementType: 'corner',
    preferredOrientation: 'any',
    functionalGroup: 'bathroom',
    minClearance: { front: 0.6, back: 0, left: 0, right: 0 },
  },

  // === Lighting ===
  'lamp': {
    placementType: 'floating',
    preferredOrientation: 'any',
    minClearance: { front: 0.1, back: 0.1, left: 0.1, right: 0.1 },
  },
  'floor-lamp': {
    placementType: 'corner',
    preferredOrientation: 'any',
    minClearance: { front: 0.2, back: 0.1, left: 0.1, right: 0.1 },
  },

  // === Decor ===
  'rug': {
    placementType: 'center',
    preferredOrientation: 'any',
    minClearance: { front: 0, back: 0, left: 0, right: 0 },
  },
  'carpet': {
    placementType: 'center',
    preferredOrientation: 'any',
    minClearance: { front: 0, back: 0, left: 0, right: 0 },
  },
  'plant': {
    placementType: 'corner',
    preferredOrientation: 'any',
    minClearance: { front: 0.1, back: 0.1, left: 0.1, right: 0.1 },
  },
  'planter': {
    placementType: 'corner',
    preferredOrientation: 'any',
    minClearance: { front: 0.1, back: 0.1, left: 0.1, right: 0.1 },
  },
}

// ============================================================================
// Default metadata for items not in the registry
// ============================================================================

const DEFAULT_META: FurniturePlacementMeta = {
  placementType: 'floating',
  preferredOrientation: 'any',
  minClearance: { front: 0.3, back: 0.1, left: 0.1, right: 0.1 },
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Look up placement metadata for a furniture item.
 * Matches against catalogSlug and category using keyword inclusion.
 */
export function getPlacementMeta(catalogSlug: string, category?: string): FurniturePlacementMeta {
  const slug = catalogSlug.toLowerCase()
  const cat = (category ?? '').toLowerCase()

  for (const [keyword, meta] of Object.entries(PLACEMENT_METADATA)) {
    if (slug.includes(keyword) || cat.includes(keyword)) {
      return meta
    }
  }

  return DEFAULT_META
}

/**
 * Check if an item should be placed against a wall.
 */
export function isAgainstWall(catalogSlug: string, category?: string): boolean {
  const meta = getPlacementMeta(catalogSlug, category)
  return meta.placementType === 'against-wall'
}

/**
 * Check if an item should be placed in a corner.
 */
export function isCornerItem(catalogSlug: string, category?: string): boolean {
  const meta = getPlacementMeta(catalogSlug, category)
  return meta.placementType === 'corner'
}

/**
 * Check if an item should be placed at room center.
 */
export function isCenterItem(catalogSlug: string, category?: string): boolean {
  const meta = getPlacementMeta(catalogSlug, category)
  return meta.placementType === 'center'
}

/**
 * Get all category keywords that are against-wall items.
 * Used by layout optimizer for backward compatibility.
 */
export function getAgainstWallCategories(): string[] {
  return Object.entries(PLACEMENT_METADATA)
    .filter(([, meta]) => meta.placementType === 'against-wall')
    .map(([keyword]) => keyword)
}
