'use client'

import { AssetPolicyGate } from '@aedifex/viewer'
import type { ReactNode } from 'react'

export function AssetPolicyBoundary({ children }: { children: ReactNode }) {
  return (
    <AssetPolicyGate
      policyUrl="/api/asset-policy"
      loading={<p role="status">Loading scene…</p>}
      unavailable={<p role="alert">Scene resources are unavailable. Refresh and try again.</p>}
    >
      {children}
    </AssetPolicyGate>
  )
}
