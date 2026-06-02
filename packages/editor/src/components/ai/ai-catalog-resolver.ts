import type { AssetInput } from '@aedifex/core'
import { CATALOG_ITEMS } from '../ui/item-catalog/catalog-items'

// ============================================================================
// Catalog Index — built once, used for slug → AssetInput resolution
// ============================================================================

/** Exact match index: slug (id) → AssetInput */
const catalogById = new Map<string, AssetInput>()

/** Name-based index for fuzzy matching: lowercase name → AssetInput */
const catalogByName = new Map<string, AssetInput>()

/** Tag-based index: tag → AssetInput[] */
const catalogByTag = new Map<string, AssetInput[]>()

/** Category-based index: category → AssetInput[] */
const catalogByCategory = new Map<string, AssetInput[]>()

// Build indexes on module load
for (const item of CATALOG_ITEMS) {
  catalogById.set(item.id, item)
  catalogByName.set(item.name.toLowerCase(), item)

  // Index by category
  const catItems = catalogByCategory.get(item.category) ?? []
  catItems.push(item)
  catalogByCategory.set(item.category, catItems)

  // Index by tags
  if (item.tags) {
    for (const tag of item.tags) {
      const tagItems = catalogByTag.get(tag) ?? []
      tagItems.push(item)
      catalogByTag.set(tag, tagItems)
    }
  }
}

// ============================================================================
// Public API
// ============================================================================

export interface CatalogResolveResult {
  asset: AssetInput | null
  matchType: 'exact' | 'name' | 'fuzzy' | 'none'
  suggestions?: AssetInput[]
  /** When fuzzy match found but shape/variant doesn't match the request */
  shapeWarning?: string
}

/** Minimum fuzzy score to accept a match (vs falling back to suggestions). */
const FUZZY_MATCH_THRESHOLD = 0.3

/**
 * Tokenize a slug or item id/name for token-based fuzzy matching. Splits on
 * `-`, `_`, whitespace and camelCase boundaries so "ceiling-lamp" and
 * "lamp ceiling" produce overlapping token sets `{ceiling, lamp}`.
 */
function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[-_\s]+/u)
    .filter((t) => t.length > 0)
}

/**
 * Resolve a catalog slug (id) to a full AssetInput object.
 * Falls back to name matching, then fuzzy matching.
 */
export function resolveCatalogSlug(slug: string): CatalogResolveResult {
  // Guard against undefined / null / whitespace-only slug
  if (!slug || !slug.trim()) {
    return { asset: null, matchType: 'none' }
  }

  // 1. Exact ID match
  const exact = catalogById.get(slug)
  if (exact) {
    return { asset: exact, matchType: 'exact' }
  }

  // 2. Exact name match (case-insensitive)
  const byName = catalogByName.get(slug.toLowerCase())
  if (byName) {
    return { asset: byName, matchType: 'name' }
  }

  // 3. Fuzzy match — token-based overlap (Jaccard-like).
  // Substring match alone fails for reordered words ("lamp ceiling" → "ceiling-lamp").
  // Token overlap survives word reordering and partial token matches.
  const slugTokens = new Set(tokenize(slug))
  if (slugTokens.size === 0) {
    return { asset: null, matchType: 'none', suggestions: findSuggestions(slug) }
  }

  let bestMatch: AssetInput | null = null
  let bestScore = 0

  for (const item of CATALOG_ITEMS) {
    const itemTokens = new Set([...tokenize(item.id), ...tokenize(item.name)])
    if (itemTokens.size === 0) continue

    // Count tokens that exist in both sets (exact match) OR where one is a
    // substring of the other (handles plurals, e.g. "lamp" ↔ "lamps").
    let matched = 0
    for (const st of slugTokens) {
      for (const it of itemTokens) {
        if (st === it || (st.length >= 3 && it.includes(st)) || (it.length >= 3 && st.includes(it))) {
          matched++
          break
        }
      }
    }

    // Score = matched / max(slug, item) — penalises both missing user tokens
    // and noisy item tokens. Equal weight to recall and precision.
    const score = matched / Math.max(slugTokens.size, itemTokens.size)

    if (score > bestScore && score >= FUZZY_MATCH_THRESHOLD) {
      bestScore = score
      bestMatch = item
    }
  }

  if (bestMatch) {
    // Shape/variant mismatch detection: if the user's slug contains shape
    // descriptors that don't match the resolved item, warn about the difference.
    const shapeWarning = detectShapeMismatch(slug, bestMatch)
    return { asset: bestMatch, matchType: 'fuzzy', shapeWarning }
  }

  // 4. No match — suggest similar items by category/tags
  const suggestions = findSuggestions(slug)
  return { asset: null, matchType: 'none', suggestions }
}

// ============================================================================
// Shape / Variant Mismatch Detection
// ============================================================================

/**
 * Shape descriptors that indicate a specific variant the user wants.
 * English-only: the LLM is instructed to always use English in tool parameters
 * (catalogSlug, description), so non-English keywords are unnecessary here.
 * Multi-language user input is translated by the LLM before reaching this layer.
 */
const SHAPE_DESCRIPTORS: Record<string, string[]> = {
  round: ['round', 'circular', 'circle'],
  square: ['square', 'rectangular'],
  'L-shaped': ['l-shaped', 'l-shape'],
  corner: ['corner'],
  small: ['small', 'mini', 'compact'],
  large: ['large', 'big', 'oversized'],
  double: ['double', 'twin'],
  single: ['single'],
}

/**
 * Detect if the user's requested slug implies a shape/variant that doesn't
 * match the resolved catalog item. Returns a warning string or undefined.
 */
function detectShapeMismatch(slug: string, resolved: AssetInput): string | undefined {
  const lower = slug.toLowerCase()
  const itemId = resolved.id.toLowerCase()
  const itemName = resolved.name.toLowerCase()

  for (const [shape, keywords] of Object.entries(SHAPE_DESCRIPTORS)) {
    const userWantsShape = keywords.some((kw) => lower.includes(kw))
    if (!userWantsShape) continue

    // Check if the resolved item already matches the shape
    const itemHasShape = keywords.some((kw) => itemId.includes(kw) || itemName.includes(kw))
    if (itemHasShape) continue

    // User wants a shape that the resolved item doesn't have
    return `User requested "${shape}" variant, but the closest available item is "${resolved.name}" (${resolved.id}). The catalog does not have a ${shape} version.`
  }

  return undefined
}

/**
 * Find suggestion items when slug doesn't match anything.
 * Tries to infer category/function from the slug text.
 */
function findSuggestions(slug: string): AssetInput[] {
  const lower = slug.toLowerCase()

  // Category keywords mapping. Keep in sync with CATALOG_ITEMS categories.
  // When you add a new category, add the words a user might describe it with —
  // not the catalog ID itself (those are matched by the fuzzy step above).
  const categoryKeywords: Record<string, string[]> = {
    furniture: ['sofa', 'couch', 'chair', 'table', 'desk', 'bed', 'shelf', 'cabinet', 'closet', 'dresser', 'lamp', 'carpet', 'rug', 'stool', 'bench'],
    kitchen: ['kitchen', 'stove', 'fridge', 'microwave', 'counter', 'sink', 'cook', 'oven', 'dishwasher'],
    bathroom: ['bathroom', 'toilet', 'shower', 'bathtub', 'sink', 'wash', 'mirror'],
    outdoor: ['outdoor', 'tree', 'plant', 'fence', 'garden', 'patio', 'pool', 'grill', 'bbq', 'umbrella', 'vehicle', 'car', 'bike'],
    appliance: ['appliance', 'tv', 'television', 'computer', 'monitor', 'speaker', 'fan', 'ac', 'air', 'heater', 'charger', 'ev', 'vacuum', 'router'],
    decor: ['decor', 'painting', 'art', 'vase', 'plant', 'sculpture', 'frame', 'clock', 'mirror'],
    lighting: ['light', 'lamp', 'chandelier', 'sconce', 'pendant', 'bulb'],
  }

  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return (catalogByCategory.get(category) ?? []).slice(0, 5)
    }
  }

  // Tag-based suggestions
  const tagKeywords = ['seating', 'lighting', 'storage', 'decor', 'bedroom', 'table']
  for (const tag of tagKeywords) {
    if (lower.includes(tag)) {
      return (catalogByTag.get(tag) ?? []).slice(0, 5)
    }
  }

  return []
}

/**
 * Generate a compact catalog summary for the Claude system prompt.
 * Includes id, name, category, dimensions, and attachTo for all items.
 * Target: ~2500 tokens.
 */
export function generateCatalogSummary(): string {
  const lines: string[] = ['Available furniture catalog:']

  // Categories that require walls to be present — these items attach to walls
  const WALL_DEPENDENT_CATEGORIES = new Set(['window', 'door'])

  // Group by category for readability
  const grouped = new Map<string, AssetInput[]>()
  for (const item of CATALOG_ITEMS) {
    const items = grouped.get(item.category) ?? []
    items.push(item)
    grouped.set(item.category, items)
  }

  for (const [category, items] of grouped) {
    if (WALL_DEPENDENT_CATEGORIES.has(category)) {
      lines.push(`\n[${category}] ⚠️ REQUIRES EXISTING WALLS — only use when walls exist in scene`)
    } else {
      lines.push(`\n[${category}]`)
    }
    for (const item of items) {
      const [w, h, d] = item.dimensions ?? [1, 1, 1]
      const attach = item.attachTo ? ` attach:${item.attachTo} (MUST have wall)` : ''
      const tags = item.tags?.length ? ` tags:${item.tags.join(',')}` : ''
      lines.push(`- ${item.id}: ${item.name} (${w}x${h}x${d}m${attach}${tags})`)
    }
  }

  lines.push('\n⚠️ IMPORTANT: Items with "attach:wall" can ONLY be placed on existing walls.')
  lines.push('If no walls exist, do NOT use window/door items. Tell the user to create walls first (B key).')

  return lines.join('\n')
}

/**
 * Get all catalog items (for external use).
 */
export function getAllCatalogItems(): AssetInput[] {
  return CATALOG_ITEMS
}
