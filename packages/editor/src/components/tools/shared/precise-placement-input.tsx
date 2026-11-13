'use client'

import { useAedifexI18n } from '@aedifex/core'
import { type PreciseField, usePrecisePlacement } from '../../../store/use-precise-placement'

export function PrecisePlacementInput({ placeholders = [] }: { placeholders?: readonly string[] }) {
  const i18n = useAedifexI18n()
  const kind = usePrecisePlacement((s) => s.kind)
  const fields = usePrecisePlacement((s) => s.fields)
  const defaults = usePrecisePlacement((s) => s.defaults)
  const active = usePrecisePlacement((s) => s.active)
  if (!kind) return null
  const labels =
    kind === 'wall'
      ? [
          i18n._({ id: 'editor.precisePlacement.length', message: 'Length' }),
          i18n._({ id: 'editor.precisePlacement.angle', message: 'Angle' }),
        ]
      : [
          i18n._({ id: 'editor.precisePlacement.distance', message: 'Distance' }),
          i18n._({ id: 'editor.precisePlacement.offset', message: 'Offset' }),
        ]
  return (
    <div
      data-precise-placement
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      style={{
        display: 'flex',
        gap: 6,
        padding: 6,
        borderRadius: 6,
        background: '#0f172a',
        color: '#f8fafc',
        whiteSpace: 'nowrap',
      }}
    >
      {labels.map((label, index) => {
        const field = index as PreciseField
        return (
          <button
            key={field === 0 ? 'first' : 'second'}
            type="button"
            aria-pressed={active === field}
            onPointerDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
              usePrecisePlacement.getState().setActive(field)
            }}
            style={{
              border: active === field ? '2px solid #818cf8' : '2px solid transparent',
              borderRadius: 4,
              padding: '3px 5px',
              background: '#e2e8f0',
              color: '#0f172a',
            }}
          >
            <span>{label}: </span>
            <span aria-live="polite">
              {fields[field] || placeholders[field] || defaults[field] || '—'}
            </span>
          </button>
        )
      })}
    </div>
  )
}
