import { getClientAssetPolicy, loadAssetUrl, subscribeClientAssetPolicy } from '@aedifex/core'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { resolveCdnUrl } from '../lib/asset-url'
import { readGuardedAssetImage } from '../lib/read-guarded-asset-image'
import { retainResourceFailure } from '../lib/resource-failures'

type ImageResolution = {
  key: string
  url: string | null
  status: 'loading' | 'available' | 'unavailable'
}

export function useAssetImageUrl(
  url: string,
  options?: { catalog?: boolean },
): Omit<ImageResolution, 'key'> {
  const catalog = options?.catalog === true
  const policy = useSyncExternalStore(
    subscribeClientAssetPolicy,
    getClientAssetPolicy,
    getClientAssetPolicy,
  )
  const key = `${policy.version}:${catalog ? 'catalog:' : ''}${url}`
  const [result, setResult] = useState<ImageResolution>({ key, url: null, status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    const unsubscribe = subscribeClientAssetPolicy(() => controller.abort())
    if (getClientAssetPolicy().version !== policy.version) controller.abort()
    let objectUrl: string | null = null
    const resolve = async () => {
      if (policy.origins === null) {
        const resolved = catalog ? resolveCdnUrl(url) : await loadAssetUrl(url)
        if (!resolved) throw new Error('Asset is unavailable')
        return resolved
      }
      const cdnResolvedUrl = catalog ? resolveCdnUrl(url) : undefined
      if (catalog && !cdnResolvedUrl) throw new Error('Asset is unavailable')
      const blob = await readGuardedAssetImage({
        url,
        origins: policy.origins,
        documentUrl: window.location.href,
        signal: controller.signal,
        cdnResolvedUrl: cdnResolvedUrl ?? undefined,
      })
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
      objectUrl = URL.createObjectURL(blob)
      return objectUrl
    }
    setResult({ key, url: null, status: 'loading' })
    resolve().then(
      (resolved) => {
        if (!controller.signal.aborted) setResult({ key, url: resolved, status: 'available' })
      },
      () => {
        if (!controller.signal.aborted) setResult({ key, url: null, status: 'unavailable' })
      },
    )
    return () => {
      controller.abort()
      unsubscribe()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [catalog, key, policy, url])

  useEffect(() => {
    if (!url || policy.origins === null || result.key !== key || result.status !== 'unavailable')
      return
    return retainResourceFailure(`image:${url}`)
  }, [key, policy, result, url])

  return result.key === key
    ? { url: result.url, status: result.status }
    : { url: null, status: 'loading' }
}
