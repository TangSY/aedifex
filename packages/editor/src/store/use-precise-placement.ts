import { create } from 'zustand'

export type PreciseField = 0 | 1
export type PreciseKind = 'wall' | 'cabinet'
type Fields = [string, string]
type KeyAction = 'changed' | 'submit' | 'cancelled'

export const usePrecisePlacement = create<{
  kind: PreciseKind | null
  fields: Fields
  active: PreciseField
  defaults: Fields
  position: [number, number, number] | null
  begin: (kind: PreciseKind, active?: PreciseField) => void
  setField: (field: PreciseField, value: string) => void
  setActive: (field: PreciseField) => void
  setDisplay: (display: { defaults: Fields; position: [number, number, number] | null }) => void
  clear: () => void
}>((set) => ({
  kind: null,
  fields: ['', ''],
  active: 0,
  defaults: ['', ''],
  position: null,
  begin: (kind, active = 0) =>
    set({ kind, active, fields: ['', ''], defaults: ['', ''], position: null }),
  setField: (field, value) =>
    set((state) => {
      const fields: Fields = [...state.fields]
      fields[field] = value.slice(0, 64)
      return { fields }
    }),
  setActive: (active) => set({ active }),
  setDisplay: ({ defaults, position }) => set({ defaults, position }),
  clear: () => set({ kind: null, fields: ['', ''], active: 0, defaults: ['', ''], position: null }),
}))

/** The active tool calls this only when the canvas owns the keyboard. */
export function routePreciseKey({
  event,
  kind,
  allowTabStart = true,
}: {
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'isComposing'>
  kind: PreciseKind
  allowTabStart?: boolean
}): KeyAction | null {
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return null
  let state = usePrecisePlacement.getState()
  if (state.kind && state.kind !== kind) return null
  if (!state.kind) {
    if (event.key === 'Tab' && allowTabStart) {
      state.begin(kind, 1)
      return 'changed'
    }
    if (!/^[0-9.]$/.test(event.key)) return null
    state.begin(kind)
    state = usePrecisePlacement.getState()
  }
  if (event.key === 'Escape') {
    state.clear()
    return 'cancelled'
  }
  if (event.key === 'Enter') return 'submit'
  if (event.key === 'Tab') {
    state.setActive(state.active === 0 ? 1 : 0)
    return 'changed'
  }
  if (event.key === 'Backspace') {
    state.setField(state.active, state.fields[state.active].slice(0, -1))
    return 'changed'
  }
  if (event.key === 'Delete') {
    state.setField(state.active, '')
    return 'changed'
  }
  if (event.key.length === 1 && /^[0-9a-zA-Z.,'"+\-/ °]$/.test(event.key)) {
    state.setField(state.active, state.fields[state.active] + event.key)
    return 'changed'
  }
  return null
}
