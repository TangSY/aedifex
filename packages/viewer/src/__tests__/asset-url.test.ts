import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Module-level mocks must be hoisted before the module under test is imported.
// vi.mock is hoisted automatically by Vitest's transform, so declarations
// here will take effect before resolveAssetUrl / resolveCdnUrl are loaded.
// ---------------------------------------------------------------------------

vi.mock('@aedifex/core', () => ({
  loadAssetUrl: vi.fn(),
}))

import { loadAssetUrl } from '@aedifex/core'
import { resolveAssetUrl, resolveCdnUrl, ASSETS_CDN_URL } from '../lib/asset-url'

// ---------------------------------------------------------------------------
// Typed reference to the mock so TypeScript is happy
// ---------------------------------------------------------------------------
const mockLoadAssetUrl = loadAssetUrl as ReturnType<typeof vi.fn>

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockLoadAssetUrl.mockReset()
})

// ===========================================================================
// resolveAssetUrl
// ===========================================================================

describe('resolveAssetUrl', () => {
  // -------------------------------------------------------------------------
  // Null / undefined / empty
  // -------------------------------------------------------------------------

  describe('returns null for falsy inputs', () => {
    it('returns null for null', async () => {
      expect(await resolveAssetUrl(null)).toBeNull()
    })

    it('returns null for undefined', async () => {
      expect(await resolveAssetUrl(undefined)).toBeNull()
    })

    it('returns null for empty string', async () => {
      expect(await resolveAssetUrl('')).toBeNull()
    })
  })

  // -------------------------------------------------------------------------
  // External URLs – pass-through
  // -------------------------------------------------------------------------

  describe('passes through external URLs unchanged', () => {
    it('returns http:// URLs as-is', async () => {
      const url = 'http://example.com/model.glb'
      expect(await resolveAssetUrl(url)).toBe(url)
    })

    it('returns https:// URLs as-is', async () => {
      const url = 'https://cdn.example.com/assets/chair.glb'
      expect(await resolveAssetUrl(url)).toBe(url)
    })

    it('does not call loadAssetUrl for external URLs', async () => {
      await resolveAssetUrl('https://example.com/foo.glb')
      expect(mockLoadAssetUrl).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // asset:// – delegate to loadAssetUrl
  // -------------------------------------------------------------------------

  describe('delegates asset:// to loadAssetUrl', () => {
    it('calls loadAssetUrl with the original asset:// URL', async () => {
      const assetUrl = 'asset://abc123'
      mockLoadAssetUrl.mockResolvedValue('blob:http://localhost/abc123')

      await resolveAssetUrl(assetUrl)

      expect(mockLoadAssetUrl).toHaveBeenCalledOnce()
      expect(mockLoadAssetUrl).toHaveBeenCalledWith(assetUrl)
    })

    it('returns the value resolved by loadAssetUrl', async () => {
      const blobUrl = 'blob:http://localhost/xyz789'
      mockLoadAssetUrl.mockResolvedValue(blobUrl)

      const result = await resolveAssetUrl('asset://xyz789')
      expect(result).toBe(blobUrl)
    })

    it('propagates rejection from loadAssetUrl', async () => {
      mockLoadAssetUrl.mockRejectedValue(new Error('IndexedDB error'))

      await expect(resolveAssetUrl('asset://bad')).rejects.toThrow('IndexedDB error')
    })
  })

  // -------------------------------------------------------------------------
  // CDN paths
  //
  // ASSETS_CDN_URL is a module-level constant evaluated at import time from
  // process.env.NEXT_PUBLIC_ASSETS_CDN_URL.  We cannot change it at runtime
  // without re-importing the module, so tests assert against the actual value
  // of the exported constant rather than a hard-coded string.
  // -------------------------------------------------------------------------

  describe('prepends CDN URL for absolute paths', () => {
    it('prepends ASSETS_CDN_URL to an absolute path', async () => {
      const result = await resolveAssetUrl('/models/chair.glb')
      expect(result).toBe(`${ASSETS_CDN_URL}/models/chair.glb`)
    })

    it('does not double-add a slash when path already starts with /', async () => {
      const result = await resolveAssetUrl('/assets/table.glb')
      // The result must not have "//" immediately after the CDN origin
      // (e.g. "https://cdn.example.com//assets/…")
      const withoutProtocol = (result ?? '').replace(/^https?:\/\/[^/]+/, '')
      expect(withoutProtocol).not.toMatch(/^\/\//)
    })

    it('returns just the absolute path when ASSETS_CDN_URL is empty', async () => {
      // When the env variable is not set, ASSETS_CDN_URL is '' — the path
      // is returned unchanged (with its leading slash).
      if (ASSETS_CDN_URL !== '') {
        // Non-empty CDN: just verify the CDN prefix is present and move on.
        const result = await resolveAssetUrl('/models/sofa.glb')
        expect(result).toContain('/models/sofa.glb')
      } else {
        const result = await resolveAssetUrl('/models/sofa.glb')
        expect(result).toBe('/models/sofa.glb')
      }
    })
  })

  describe('prepends CDN URL with leading slash for relative paths', () => {
    it('adds a leading slash before prepending ASSETS_CDN_URL', async () => {
      const result = await resolveAssetUrl('models/lamp.glb')
      expect(result).toBe(`${ASSETS_CDN_URL}/models/lamp.glb`)
    })

    it('handles a bare filename (no directory)', async () => {
      const result = await resolveAssetUrl('table.glb')
      expect(result).toBe(`${ASSETS_CDN_URL}/table.glb`)
    })

    it('normalizes relative paths by prepending a slash', async () => {
      const result = await resolveAssetUrl('models/bed.glb')
      // Whether CDN is set or not, the path segment must start with /
      const pathPart = (result ?? '').replace(ASSETS_CDN_URL, '')
      expect(pathPart).toMatch(/^\//)
    })
  })
})

// ===========================================================================
// resolveCdnUrl
// ===========================================================================

describe('resolveCdnUrl', () => {
  // -------------------------------------------------------------------------
  // Null / undefined / empty
  // -------------------------------------------------------------------------

  describe('returns null for falsy inputs', () => {
    it('returns null for null', () => {
      expect(resolveCdnUrl(null)).toBeNull()
    })

    it('returns null for undefined', () => {
      expect(resolveCdnUrl(undefined)).toBeNull()
    })

    it('returns null for empty string', () => {
      expect(resolveCdnUrl('')).toBeNull()
    })
  })

  // -------------------------------------------------------------------------
  // External URLs – pass-through
  // -------------------------------------------------------------------------

  describe('passes through external URLs unchanged', () => {
    it('returns http:// URLs as-is', () => {
      const url = 'http://example.com/model.glb'
      expect(resolveCdnUrl(url)).toBe(url)
    })

    it('returns https:// URLs as-is', () => {
      const url = 'https://cdn.example.com/assets/chair.glb'
      expect(resolveCdnUrl(url)).toBe(url)
    })
  })

  // -------------------------------------------------------------------------
  // asset:// – warn and return null
  // -------------------------------------------------------------------------

  describe('handles asset:// URLs', () => {
    it('returns null for asset:// URLs', () => {
      expect(resolveCdnUrl('asset://abc123')).toBeNull()
    })

    it('emits a console.warn for asset:// URLs', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

      resolveCdnUrl('asset://abc123')

      expect(warnSpy).toHaveBeenCalledOnce()
      warnSpy.mockRestore()
    })

    it('does not emit console.warn for non-asset:// URLs', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

      resolveCdnUrl('/models/chair.glb')

      expect(warnSpy).not.toHaveBeenCalled()
      warnSpy.mockRestore()
    })
  })

  // -------------------------------------------------------------------------
  // CDN paths
  //
  // Same constraint as resolveAssetUrl: ASSETS_CDN_URL is fixed at import
  // time, so we assert relative to the exported constant.
  // -------------------------------------------------------------------------

  describe('prepends CDN URL for paths', () => {
    it('prepends ASSETS_CDN_URL to an absolute path', () => {
      expect(resolveCdnUrl('/models/sofa.glb')).toBe(`${ASSETS_CDN_URL}/models/sofa.glb`)
    })

    it('adds a leading slash before prepending ASSETS_CDN_URL for relative paths', () => {
      expect(resolveCdnUrl('models/lamp.glb')).toBe(`${ASSETS_CDN_URL}/models/lamp.glb`)
    })

    it('does not double-add a slash for absolute paths', () => {
      const result = resolveCdnUrl('/assets/table.glb')
      const withoutProtocol = (result ?? '').replace(/^https?:\/\/[^/]+/, '')
      expect(withoutProtocol).not.toMatch(/^\/\//)
    })

    it('returns just the absolute path when ASSETS_CDN_URL is empty', () => {
      if (ASSETS_CDN_URL !== '') {
        expect(resolveCdnUrl('/models/bed.glb')).toContain('/models/bed.glb')
      } else {
        expect(resolveCdnUrl('/models/bed.glb')).toBe('/models/bed.glb')
      }
    })
  })
})
