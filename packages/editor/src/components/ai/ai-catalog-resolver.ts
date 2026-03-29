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
}

/**
 * Resolve a catalog slug (id) to a full AssetInput object.
 * Falls back to name matching, then fuzzy matching.
 */
export function resolveCatalogSlug(slug: string): CatalogResolveResult {
  // Guard against undefined/null slug
  if (!slug) {
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

  // 3. Fuzzy match: find items whose id or name contains the slug
  const normalizedSlug = slug.toLowerCase().replace(/[-_\s]+/g, '')
  let bestMatch: AssetInput | null = null
  let bestScore = 0

  for (const item of CATALOG_ITEMS) {
    const normalizedId = item.id.toLowerCase().replace(/[-_\s]+/g, '')
    const normalizedName = item.name.toLowerCase().replace(/[-_\s]+/g, '')

    let score = 0

    // Substring match in id
    if (normalizedId.includes(normalizedSlug)) {
      score = normalizedSlug.length / normalizedId.length
    }
    // Substring match in name
    if (normalizedName.includes(normalizedSlug)) {
      const nameScore = normalizedSlug.length / normalizedName.length
      score = Math.max(score, nameScore)
    }
    // Reverse: slug contains item id
    if (normalizedSlug.includes(normalizedId)) {
      const reverseScore = normalizedId.length / normalizedSlug.length * 0.8
      score = Math.max(score, reverseScore)
    }

    if (score > bestScore && score > 0.3) {
      bestScore = score
      bestMatch = item
    }
  }

  if (bestMatch) {
    return { asset: bestMatch, matchType: 'fuzzy' }
  }

  // 4. No match — suggest similar items by category/tags
  const suggestions = findSuggestions(slug)
  return { asset: null, matchType: 'none', suggestions }
}

/**
 * Find suggestion items when slug doesn't match anything.
 * Tries to infer category/function from the slug text.
 */
function findSuggestions(slug: string): AssetInput[] {
  const lower = slug.toLowerCase()

  // Category keywords mapping
  const categoryKeywords: Record<string, string[]> = {
    furniture: ['sofa', 'couch', 'chair', 'table', 'desk', 'bed', 'shelf', 'cabinet', 'closet', 'dresser', 'lamp', 'carpet', 'rug'],
    kitchen: ['kitchen', 'stove', 'fridge', 'microwave', 'counter', 'sink', 'cook'],
    bathroom: ['bathroom', 'toilet', 'shower', 'bathtub', 'sink', 'wash'],
    outdoor: ['outdoor', 'tree', 'plant', 'fence', 'garden', 'patio'],
    appliance: ['tv', 'television', 'computer', 'speaker', 'fan', 'ac', 'air'],
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
