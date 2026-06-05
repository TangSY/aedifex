import { describe, expect, test } from 'bun:test'
import {
  getCatalogMaterialById,
  getLibraryMaterialIdFromRef,
  getMaterialPresetByRef,
  getMaterialsForCategory,
  LIBRARY_MATERIAL_REF_PREFIX,
  MATERIAL_CATALOG,
  MATERIAL_CATEGORIES,
  toLibraryMaterialRef,
} from './material-library'
import { AssetUrl } from './schema/asset-url'

/**
 * Round-2 catalog-integrity tests. These mirror the drift class that the
 * `validateRemoveNode` bug exposed: a hand-maintained constant table where
 * a single typo silently breaks downstream behaviour (broken texture URL,
 * duplicated id collapsing two materials into one).
 */
describe('MATERIAL_CATALOG integrity', () => {
  test('every preset.maps URL passes the AssetUrl allowlist', () => {
    for (const item of MATERIAL_CATALOG) {
      for (const [mapKey, url] of Object.entries(item.preset.maps)) {
        if (typeof url !== 'string') continue
        const ok = AssetUrl.safeParse(url).success
        expect(
          ok,
          `material ${item.id} preset.maps.${mapKey} (${url}) failed AssetUrl allowlist`,
        ).toBe(true)
      }
    }
  })

  test('every previewThumbnailUrl passes the AssetUrl allowlist (when present)', () => {
    // previewThumbnailUrl is `string` in the schema (not validated), but is
    // loaded the same way and benefits from the same allowlist drift check.
    for (const item of MATERIAL_CATALOG) {
      if (!item.previewThumbnailUrl) continue
      expect(
        AssetUrl.safeParse(item.previewThumbnailUrl).success,
        `material ${item.id} previewThumbnailUrl (${item.previewThumbnailUrl}) failed`,
      ).toBe(true)
    }
  })

  test('every catalog item id is unique', () => {
    const seen = new Map<string, number>()
    for (const item of MATERIAL_CATALOG) {
      seen.set(item.id, (seen.get(item.id) ?? 0) + 1)
    }
    const duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id)
    expect(duplicates).toEqual([])
  })

  test('every catalog item declares a known MATERIAL_CATEGORIES value', () => {
    const allowed = new Set<string>(MATERIAL_CATEGORIES)
    for (const item of MATERIAL_CATALOG) {
      expect(allowed.has(item.category)).toBe(true)
    }
  })

  test('getMaterialsForCategory partitions the catalog', () => {
    const totals = MATERIAL_CATEGORIES.map((c) => getMaterialsForCategory(c).length)
    const sum = totals.reduce((n, x) => n + x, 0)
    expect(sum).toBe(MATERIAL_CATALOG.length)
  })

  test('getCatalogMaterialById round-trips for every entry', () => {
    for (const item of MATERIAL_CATALOG) {
      expect(getCatalogMaterialById(item.id)?.id).toBe(item.id)
    }
    expect(getCatalogMaterialById(undefined)).toBeUndefined()
    expect(getCatalogMaterialById('not-a-real-material')).toBeUndefined()
  })

  test('library: ref helpers round-trip and reject foreign refs', () => {
    const id = MATERIAL_CATALOG[0]!.id
    const ref = toLibraryMaterialRef(id)
    expect(ref).toBe(`${LIBRARY_MATERIAL_REF_PREFIX}${id}`)
    expect(getLibraryMaterialIdFromRef(ref)).toBe(id)
    expect(getLibraryMaterialIdFromRef(null)).toBeNull()
    expect(getLibraryMaterialIdFromRef(undefined)).toBeNull()
    expect(getLibraryMaterialIdFromRef('something-else:foo')).toBeNull()
    // Preset lookup follows the ref and returns the same preset.
    expect(getMaterialPresetByRef(ref)).toBe(MATERIAL_CATALOG[0]!.preset)
    expect(getMaterialPresetByRef('library:does-not-exist')).toBeNull()
    expect(getMaterialPresetByRef(null)).toBeNull()
  })
})
