import { loadAssetUrl, resolveArtifactUrl, resolveStaticMaterialPath } from '@aedifex/core'

export const ASSETS_CDN_URL = process.env.NEXT_PUBLIC_ASSETS_CDN_URL || 'https://editor.aedifex.com'

function resolveHostedMaterialUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.origin !== new URL(ASSETS_CDN_URL).origin) return url
    const path = decodeURIComponent(parsed.pathname)
    const mapped = resolveStaticMaterialPath(path)
    return mapped === path ? url : `${parsed.origin}${mapped}${parsed.search}${parsed.hash}`
  } catch {
    return url
  }
}

/**
 * Resolves an asset URL to the appropriate format:
 * - If URL starts with http:// or https://, return as-is (external URL)
 * - If URL starts with asset://, resolve from IndexedDB storage
 * - If URL starts with /, prepend CDN URL (absolute path)
 * - Otherwise, prepend CDN URL (relative path)
 */
export async function resolveAssetUrl(url: string | undefined | null): Promise<string | null> {
  if (!url) return null

  if (url.startsWith('artifact://')) return resolveArtifactUrl(url)

  // External URL - use as-is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return resolveHostedMaterialUrl(url)
  }

  // IndexedDB asset - resolve from storage
  if (url.startsWith('asset://')) {
    return loadAssetUrl(url)
  }

  // Absolute or relative path - prepend CDN URL
  const normalizedPath = resolveStaticMaterialPath(url.startsWith('/') ? url : `/${url}`)
  return `${ASSETS_CDN_URL}${normalizedPath}`
}

/**
 * Synchronous version for URLs that don't need IndexedDB resolution
 * Only use this if you're sure the URL is not an asset:// URL
 */
export function resolveCdnUrl(url: string | undefined | null): string | null {
  if (!url) return null

  if (url.startsWith('artifact://')) return resolveArtifactUrl(url)
  if (url.startsWith('blob:')) return url

  // External URL - use as-is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return resolveHostedMaterialUrl(url)
  }

  // Don't use this for asset:// URLs - use resolveAssetUrl instead
  if (url.startsWith('asset://')) {
    console.warn('Use resolveAssetUrl() for asset:// URLs, not resolveCdnUrl()')
    return null
  }

  // Absolute or relative path - prepend CDN URL
  const normalizedPath = resolveStaticMaterialPath(url.startsWith('/') ? url : `/${url}`)
  return `${ASSETS_CDN_URL}${normalizedPath}`
}
