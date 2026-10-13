'use client'

import type { WebXRFeature } from './runtime'

export function WebXRToolbarButton({
  feature,
  onEnter,
}: {
  feature: WebXRFeature
  onEnter?: () => void
}) {
  if (!feature.enabled) return null

  const active = feature.status === 'active'
  const entering = feature.status === 'entering'
  const label = feature.error ?? (active ? 'Exit VR' : onEnter ? 'Open VR preview' : 'Enter VR')

  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background/90 text-foreground shadow-sm transition-colors hover:bg-accent disabled:cursor-wait disabled:opacity-50 ${
        active ? 'bg-sky-500/15 text-sky-500' : ''
      }`}
      disabled={entering}
      onClick={() => void (active ? feature.exit() : onEnter ? onEnter() : feature.enter())}
      title={label}
      type="button"
    >
      <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
        <path
          d="M3.5 8.5h17v7a2 2 0 0 1-2 2h-2.1a2 2 0 0 1-1.6-.8L13 14.3a1.25 1.25 0 0 0-2 0l-1.8 2.4a2 2 0 0 1-1.6.8H5.5a2 2 0 0 1-2-2v-7Z"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
        <path d="M8 12h.01M16 12h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" />
      </svg>
    </button>
  )
}
