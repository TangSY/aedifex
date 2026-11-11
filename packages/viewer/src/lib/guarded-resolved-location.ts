import { AssetAccessError, restrictedAssetUrl } from '@aedifex/core'

export function guardedResolvedLocation({
  sourceUrl,
  resolvedUrl,
  documentUrl,
  origins,
}: {
  sourceUrl?: string
  resolvedUrl: string
  documentUrl: string
  origins: readonly string[]
}): string {
  const allowedOrigins = new Set(origins)
  const normalized = sourceUrl?.replace(/[\t\r\n]/g, '') ?? ''
  let start = 0
  while (start < normalized.length && normalized.charCodeAt(start) <= 0x20) start++
  const explicit = /^[a-z][a-z0-9+.-]*:/i.test(normalized.slice(start))
  const handle = /^(?:asset|artifact):\/\//.test(normalized.slice(start))
  if (sourceUrl && !handle) {
    restrictedAssetUrl({ url: sourceUrl, baseUrl: documentUrl, documentUrl, allowedOrigins })
  }
  let source = resolvedUrl
  if (
    (!sourceUrl || !explicit || handle) &&
    !resolvedUrl.startsWith('blob:') &&
    !resolvedUrl.startsWith('data:')
  ) {
    try {
      const resolved = new URL(resolvedUrl, documentUrl)
      if (resolved.origin === new URL(documentUrl).origin)
        source = `${resolved.pathname}${resolved.search}${resolved.hash}`
    } catch {
      throw new AssetAccessError('Asset URL is unavailable')
    }
  }
  restrictedAssetUrl({ url: source, baseUrl: documentUrl, documentUrl, allowedOrigins })
  return source
}
