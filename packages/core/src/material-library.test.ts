import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'bun:test'
import { getLibraryMaterialIdFromRef, getSceneMaterialIdFromRef, MATERIAL_CATALOG } from './material-library'

describe('material references', () => {
  test('rejects malformed runtime values instead of calling string methods', () => {
    const malformedRefs: unknown[] = [42, true, {}, []]

    for (const ref of malformedRefs) {
      expect(getLibraryMaterialIdFromRef(ref as string)).toBeNull()
      expect(getSceneMaterialIdFromRef(ref as string)).toBeNull()
    }
  })
})

test('static material catalog references assets present in the editor', () => {
  const publicDir = fileURLToPath(new URL('../../../apps/editor/public', import.meta.url))
  for (const item of MATERIAL_CATALOG) {
    const paths = [item.previewThumbnailUrl, ...Object.values(item.preset.maps)]
    for (const path of paths) {
      if (path?.startsWith('/material/')) expect(existsSync(`${publicDir}${path}`)).toBe(true)
    }
  }
})
