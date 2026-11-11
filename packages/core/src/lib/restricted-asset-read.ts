import {
  ALLOWED_ORIGINS_ENV,
  isSchemeRelativeAssetUrl,
  parseAllowedOrigins,
} from '../schema/asset-url'

export function publicAssetOrigins(raw: string | undefined): string[] | null {
  if (!raw) return null
  const { origins } = parseAllowedOrigins(raw)
  return [...origins].filter((origin) => origin.startsWith('https://')).sort()
}

export function publicAssetOriginsFromBindings(bindings: Record<string, unknown>): string[] | null {
  const value = bindings[ALLOWED_ORIGINS_ENV]
  if (value !== undefined && typeof value !== 'string')
    throw new Error('Invalid asset origin policy')
  return publicAssetOrigins(value)
}

export function parsePublicAssetOrigins(value: unknown): string[] | null {
  if (value === null) return null
  if (!Array.isArray(value)) throw new Error('Invalid asset origin policy')
  const origins = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') throw new Error('Invalid asset origin policy')
    const parsed = new URL(item)
    if (
      parsed.protocol !== 'https:' ||
      parsed.origin !== item ||
      parsed.username ||
      parsed.password ||
      parsed.hostname.includes('*')
    ) {
      throw new Error('Invalid asset origin policy')
    }
    origins.add(item)
  }
  return [...origins].sort()
}

type ResourceLocation = {
  url: string
  baseUrl: string
  documentUrl: string
  allowedOrigins: ReadonlySet<string>
  trustedRelativeOrigin?: string
}

export class AssetAccessError extends Error {
  readonly response?: { status: number }

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'AssetAccessError'
    if (status !== undefined) this.response = { status }
  }
}

export class AssetNetworkError extends AssetAccessError {
  constructor() {
    super('Asset network request failed')
    this.name = 'AssetNetworkError'
  }
}

export function restrictedAssetUrl({
  url,
  baseUrl,
  documentUrl,
  allowedOrigins,
  trustedRelativeOrigin,
}: ResourceLocation): string {
  if (isSchemeRelativeAssetUrl(url)) throw new AssetAccessError('Asset URL is unavailable')
  const normalized = url.replace(/[\t\r\n]/g, '')
  let start = 0
  while (start < normalized.length && normalized.charCodeAt(start) <= 0x20) start++
  if (start === normalized.length) throw new AssetAccessError('Asset URL is unavailable')
  const explicit = /^[a-z][a-z0-9+.-]*:/i.test(normalized.slice(start))
  let parsed: URL
  try {
    parsed = new URL(url, baseUrl)
  } catch {
    throw new AssetAccessError('Asset URL is unavailable')
  }
  if (parsed.protocol === 'blob:' || parsed.protocol === 'data:') return parsed.href
  if (parsed.username || parsed.password) throw new AssetAccessError('Asset URL is unavailable')
  const document = new URL(documentUrl)
  if (parsed.protocol === 'http:') {
    if (parsed.origin === document.origin && ['localhost', '127.0.0.1'].includes(parsed.hostname)) {
      return parsed.href
    }
    throw new AssetAccessError('Asset URL is unavailable')
  }
  if (parsed.protocol !== 'https:') throw new AssetAccessError('Asset URL is unavailable')
  const trustedRelative = !explicit && parsed.origin === trustedRelativeOrigin
  if (
    (explicit || parsed.origin !== document.origin) &&
    !trustedRelative &&
    !allowedOrigins.has(parsed.origin)
  ) {
    throw new AssetAccessError('Asset origin is unavailable')
  }
  return parsed.href
}

export type AssetReadBudget = { readonly maxBytes: number; usedBytes: number }

export function createAssetReadBudget(maxBytes: number): AssetReadBudget {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('Invalid asset budget')
  return { maxBytes, usedBytes: 0 }
}

export async function readRestrictedAsset({
  budget,
  fetcher = fetch,
  signal,
  credentials = 'same-origin',
  headers,
  ...location
}: ResourceLocation & {
  budget: AssetReadBudget
  fetcher?: typeof fetch
  signal?: AbortSignal
  credentials?: RequestCredentials
  headers?: HeadersInit
}): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const url = restrictedAssetUrl(location)
  let response: Response
  try {
    response = await fetcher(url, { redirect: 'error', credentials, headers, signal })
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (error instanceof TypeError) throw new AssetNetworkError()
    throw error
  }
  if (signal?.aborted || !response.ok || response.redirected) {
    await response.body?.cancel().catch(() => {})
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    throw new AssetAccessError('Asset is unavailable', response.status)
  }
  const length = response.headers.get('content-length')
  if (length && /^\d+$/.test(length)) {
    const declared = Number(length)
    if (!Number.isSafeInteger(declared) || declared > budget.maxBytes - budget.usedBytes) {
      await response.body?.cancel().catch(() => {})
      throw new AssetAccessError('Asset budget exceeded')
    }
  }
  const contentType = response.headers.get('content-type') ?? ''
  if (!response.body) return { bytes: new Uint8Array(), contentType }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const result = await reader.read()
      if (result.done) break
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      if (result.value.byteLength > budget.maxBytes - budget.usedBytes)
        throw new AssetAccessError('Asset budget exceeded')
      budget.usedBytes += result.value.byteLength
      total += result.value.byteLength
      chunks.push(result.value)
    }
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  } finally {
    reader.releaseLock()
  }
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { bytes: result, contentType }
}
