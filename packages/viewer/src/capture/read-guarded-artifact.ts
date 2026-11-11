import { createAssetReadBudget, readRestrictedAsset } from '@aedifex/core'
import { guardedResolvedLocation } from '../lib/guarded-resolved-location'

export async function readGuardedCaptureArtifact({
  sourceUrl,
  resolvedUrl,
  documentUrl,
  origins,
  signal,
  maxBytes,
}: {
  sourceUrl?: string
  resolvedUrl: string
  documentUrl: string
  origins: readonly string[]
  signal: AbortSignal
  maxBytes: number
}): Promise<Uint8Array> {
  const allowedOrigins = new Set(origins)
  const source = guardedResolvedLocation({ sourceUrl, resolvedUrl, documentUrl, origins })
  const { bytes } = await readRestrictedAsset({
    url: source,
    baseUrl: documentUrl,
    documentUrl,
    allowedOrigins,
    budget: createAssetReadBudget(maxBytes),
    signal,
  })
  return bytes
}
