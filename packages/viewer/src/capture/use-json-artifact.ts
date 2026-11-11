import { AssetAccessError, getClientAssetPolicy, subscribeClientAssetPolicy } from '@aedifex/core'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { FileLoader } from 'three'
import { retainResourceFailure } from '../lib/resource-failures'
import { rewriteLoopbackAssetUrl } from './asset-url'
import { readGuardedCaptureArtifact } from './read-guarded-artifact'

const requests = new Map<string, Promise<unknown>>()

function loadJsonArtifact(url: string): Promise<unknown> {
  const cached = requests.get(url)
  if (cached) return cached
  const request = new FileLoader().setResponseType('json').loadAsync(url)
  requests.set(url, request)
  // Keep successful downloads across view switches, but let a remount retry failures.
  void request.catch(() => requests.delete(url))
  return request
}

export function useJsonArtifactPayload(url: string | null, sourceUrl?: string): unknown {
  const policy = useSyncExternalStore(
    subscribeClientAssetPolicy,
    getClientAssetPolicy,
    getClientAssetPolicy,
  )
  const resolvedUrl = url ? rewriteLoopbackAssetUrl(url) : null
  const key = `${policy.version}:${sourceUrl ?? ''}:${resolvedUrl ?? ''}`
  const [result, setResult] = useState<{
    key: string
    payload?: unknown
    error?: Error
    unavailable?: boolean
  } | null>(null)

  useEffect(() => {
    if (!resolvedUrl) return
    let active = true
    const controller = new AbortController()
    const unsubscribe = subscribeClientAssetPolicy(() => controller.abort())
    if (getClientAssetPolicy().version !== policy.version) controller.abort()
    const request =
      policy.origins === null
        ? loadJsonArtifact(resolvedUrl)
        : readGuardedCaptureArtifact({
            sourceUrl,
            resolvedUrl,
            documentUrl: window.location.href,
            origins: policy.origins,
            signal: controller.signal,
            maxBytes: Number.MAX_SAFE_INTEGER,
          }).then((bytes) => JSON.parse(new TextDecoder().decode(bytes)) as unknown)
    void request.then(
      (payload) => {
        if (active && !controller.signal.aborted) setResult({ key, payload })
      },
      (cause: unknown) => {
        if (active && !controller.signal.aborted) {
          setResult({
            key,
            error: cause instanceof Error ? cause : new Error('Could not load capture data.'),
            unavailable: cause instanceof AssetAccessError,
          })
        }
      },
    )
    return () => {
      active = false
      controller.abort()
      unsubscribe()
    }
  }, [key, policy, resolvedUrl, sourceUrl])

  useEffect(() => {
    if (result?.key !== key || !result.unavailable || !resolvedUrl) return
    return retainResourceFailure(`capture:${sourceUrl ?? resolvedUrl}`)
  }, [key, resolvedUrl, result, sourceUrl])

  if (!result || result.key !== key || result.unavailable) return null
  if (result.error) throw result.error
  return result.payload ?? null
}
