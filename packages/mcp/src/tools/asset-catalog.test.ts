import { describe, expect, test } from 'bun:test'
import { MaterialMapsSchema } from '@aedifex/core/schema'
import { findCatalogItem, MCP_CATALOG_ITEMS, searchCatalogItems } from './asset-catalog'

// MaterialMapsSchema's albedoMap field uses the same AssetUrl validator that
// AssetInput.src uses — re-using it here lets us assert the allowlist without
// adding a new schema export.
function passesAssetUrlAllowlist(url: string): boolean {
  return MaterialMapsSchema.safeParse({ albedoMap: url }).success
}

/**
 * Round-2 integrity + behaviour tests for the standalone MCP catalog.
 * Same drift-class motivation as the material-library tests.
 */
describe('MCP_CATALOG_ITEMS integrity', () => {
  test('every src passes the AssetUrl allowlist', () => {
    for (const item of MCP_CATALOG_ITEMS) {
      expect(
        passesAssetUrlAllowlist(item.src),
        `${item.id} src (${item.src}) failed AssetUrl allowlist`,
      ).toBe(true)
    }
  })

  test('every id is unique', () => {
    const seen = new Map<string, number>()
    for (const item of MCP_CATALOG_ITEMS) {
      seen.set(item.id, (seen.get(item.id) ?? 0) + 1)
    }
    const duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id)
    expect(duplicates).toEqual([])
  })

  test('every item has the minimum tuple-shaped transforms', () => {
    for (const item of MCP_CATALOG_ITEMS) {
      // These are tuples in the schema; an editor copy-paste mistake that
      // drops one component would crash item placement.
      expect(item.dimensions).toHaveLength(3)
      expect(item.offset).toHaveLength(3)
      expect(item.rotation).toHaveLength(3)
      expect(item.scale).toHaveLength(3)
    }
  })
})

describe('findCatalogItem', () => {
  test('returns the item by id', () => {
    expect(findCatalogItem('double-bed')?.name).toBe('Double Bed')
  })

  test('returns undefined for unknown id', () => {
    expect(findCatalogItem('does-not-exist')).toBeUndefined()
  })
})

describe('searchCatalogItems', () => {
  test('matches by name token', () => {
    const results = searchCatalogItems({ query: 'bed' })
    const ids = results.map((r) => r.id)
    expect(ids).toContain('double-bed')
    expect(ids).toContain('single-bed')
    expect(ids).toContain('bedside-table')
  })

  test('matches by tag token', () => {
    const results = searchCatalogItems({ query: 'kitchen' })
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((r) => r.category === 'kitchen' || r.tags?.includes('kitchen'))).toBe(true)
  })

  test('category filter narrows results', () => {
    const all = searchCatalogItems({ query: 'storage' })
    const onlyBedroom = searchCatalogItems({ query: 'storage', category: 'furniture' })
    expect(onlyBedroom.every((r) => r.category === 'furniture')).toBe(true)
    expect(onlyBedroom.length).toBeLessThanOrEqual(all.length)
  })

  test('multi-term query requires every term to match', () => {
    // "bedroom" and "storage" together — should only return items tagged with both.
    const results = searchCatalogItems({ query: 'bedroom storage' })
    for (const item of results) {
      const haystack = [item.id, item.name, item.category, ...(item.tags ?? [])]
        .join(' ')
        .toLowerCase()
      expect(haystack).toContain('bedroom')
      expect(haystack).toContain('storage')
    }
  })

  test('empty query returns the full catalog', () => {
    const results = searchCatalogItems({ query: '' })
    expect(results.length).toBe(MCP_CATALOG_ITEMS.length)
  })
})
