import {
  createAssetReadBudget,
  loadAssetUrl,
  readRestrictedAsset,
  restrictedAssetUrl,
} from '@aedifex/core'
import { guardedCdnLocation } from './guarded-cdn-location'

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

/** Read an image without letting the browser follow redirects to unchecked origins. */
export async function readGuardedAssetImage({
  url,
  origins,
  documentUrl,
  signal,
  cdnResolvedUrl,
}: {
  url: string
  origins: readonly string[]
  documentUrl: string
  signal?: AbortSignal
  cdnResolvedUrl?: string
}): Promise<Blob> {
  const location =
    cdnResolvedUrl === undefined
      ? { source: url, baseUrl: documentUrl, trustedRelativeOrigin: undefined }
      : guardedCdnLocation({ source: url, resolvedUrl: cdnResolvedUrl, documentUrl })
  let source = location.source
  if (cdnResolvedUrl !== undefined && /^https?:/i.test(url.replace(/[\t\r\n]/g, '').trimStart())) {
    restrictedAssetUrl({ url, baseUrl: documentUrl, documentUrl, allowedOrigins: new Set(origins) })
    source = cdnResolvedUrl
  }
  if (cdnResolvedUrl === undefined || url.startsWith('asset://') || url.startsWith('artifact://')) {
    const resolved = await abortable(loadAssetUrl(url), signal)
    if (!resolved) throw new Error('Asset is unavailable')
    source = resolved
  }
  if (url.startsWith('artifact://')) {
    const target = new URL(source, documentUrl)
    if (target.origin === new URL(documentUrl).origin) {
      source = `${target.pathname}${target.search}${target.hash}`
    }
  }
  const { bytes, contentType } = await abortable(
    readRestrictedAsset({
      url: source,
      baseUrl: location.baseUrl,
      documentUrl,
      trustedRelativeOrigin: location.trustedRelativeOrigin,
      allowedOrigins: new Set(origins),
      budget: createAssetReadBudget(Number.MAX_SAFE_INTEGER),
      signal,
    }),
    signal,
  )
  return new Blob([bytes as BlobPart], { type: contentType })
}
