import { AssetAccessError, isSchemeRelativeAssetUrl } from '@aedifex/core'
import { ASSETS_CDN_URL, resolveCdnUrl } from './asset-url'

export function guardedCdnLocation({
  source,
  resolvedUrl,
  documentUrl,
}: {
  source: string
  resolvedUrl: string
  documentUrl: string
}): { source: string; baseUrl: string; trustedRelativeOrigin?: string } {
  if (isSchemeRelativeAssetUrl(source)) throw new AssetAccessError('Asset URL is unavailable')
  const cleaned = source.replace(/[\t\r\n]/g, '')
  let start = 0
  while (start < cleaned.length && cleaned.charCodeAt(start) <= 0x20) start++
  const normalized = cleaned.slice(start)
  const explicit = /^[a-z][a-z0-9+.-]*:/i.test(normalized)
  if (explicit) {
    if (!/^(?:asset|artifact|blob|data):/i.test(normalized)) {
      try {
        const original = new URL(normalized, documentUrl)
        const resolved = new URL(resolvedUrl, documentUrl)
        if (original.origin !== resolved.origin) throw new Error()
      } catch {
        throw new AssetAccessError('Asset URL is unavailable')
      }
    }
    return { source, baseUrl: documentUrl }
  }
  if (resolveCdnUrl(source) !== resolvedUrl) throw new AssetAccessError('Asset URL is unavailable')
  const cdn = new URL(ASSETS_CDN_URL, documentUrl)
  const resolved = new URL(resolvedUrl, documentUrl)
  if (resolved.origin !== cdn.origin) throw new AssetAccessError('Asset URL is unavailable')
  return {
    source: `${resolved.pathname}${resolved.search}${resolved.hash}`,
    baseUrl: `${cdn.origin}/`,
    trustedRelativeOrigin: cdn.origin,
  }
}
