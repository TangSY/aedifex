'use client'

import { configureClientAssetPolicy, parsePublicAssetOrigins } from '@aedifex/core'
import { type ReactNode, useEffect, useState, useSyncExternalStore } from 'react'
import { getResourceFailureCount, subscribeResourceFailures } from '../lib/resource-failures'

type State = 'loading' | 'ready' | 'unavailable'

export function AssetPolicyGate({
  children,
  policyUrl,
  loading,
  unavailable,
  resourceWarning = 'Some scene resources are unavailable.',
}: {
  children: ReactNode
  policyUrl: string
  loading: ReactNode
  unavailable: ReactNode
  resourceWarning?: ReactNode
}) {
  const failures = useSyncExternalStore(subscribeResourceFailures, getResourceFailureCount, () => 0)
  const [state, setState] = useState<{ url: string; status: State }>({
    url: policyUrl,
    status: 'loading',
  })

  useEffect(() => {
    const controller = new AbortController()
    setState({ url: policyUrl, status: 'loading' })
    fetch(policyUrl, {
      cache: 'no-store',
      credentials: 'same-origin',
      redirect: 'error',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok || response.redirected) throw new Error('Asset policy unavailable')
        const data: unknown = await response.json()
        if (!data || typeof data !== 'object' || !('origins' in data))
          throw new Error('Asset policy unavailable')
        return parsePublicAssetOrigins(data.origins)
      })
      .then((origins) => {
        if (controller.signal.aborted) return
        configureClientAssetPolicy(origins)
        setState({ url: policyUrl, status: 'ready' })
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ url: policyUrl, status: 'unavailable' })
      })
    return () => controller.abort()
  }, [policyUrl])

  if (state.url !== policyUrl || state.status === 'loading') return loading
  if (state.status === 'unavailable') return unavailable
  return (
    <>
      {children}
      {failures > 0 && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: 16,
            right: 16,
            zIndex: 100,
            padding: '8px 12px',
            background: '#78350f',
            color: '#fff',
            borderRadius: 6,
          }}
        >
          {resourceWarning}
        </div>
      )}
    </>
  )
}
