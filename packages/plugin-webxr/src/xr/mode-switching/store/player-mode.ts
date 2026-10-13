import { create } from 'zustand'
import type { TransitionPhase } from '../lib/mode-transition'

export const XR_PLAYER_MODES = {
  GOD: 'god',
  HUMAN: 'human',
} as const

export type XRPlayerMode =
  (typeof XR_PLAYER_MODES)[keyof typeof XR_PLAYER_MODES]

type XRPlayerModeState = {
  mode: XRPlayerMode
  transitionTarget: XRPlayerMode | null
  transitionPhase: TransitionPhase
  inputLocked: boolean
  setTransitionPhase(phase: TransitionPhase): void
  completeReturn(): void
  reset(): void
  entryRequested: boolean
  entryConfirmed: boolean
  entryPlaced: boolean
  placeEntry(): void
  entryMessage: string | null
  entryTargetRevision: number
  retargetEntry(): void
  cancelEntry(): void
  completeEntry(): void
  setEntryMessage(message: string | null): void
  rejectEntry(message: string | null): void
  setMode(mode: XRPlayerMode): void
  toggle(): void
}

export const useXRPlayerMode = create<XRPlayerModeState>((set, get) => ({
  mode: XR_PLAYER_MODES.GOD,
  transitionTarget: null,
  transitionPhase: 'idle',
  inputLocked: false,
  setTransitionPhase: (transitionPhase) =>
    set({
      transitionPhase,
      inputLocked: transitionPhase !== 'idle',
      ...(transitionPhase === 'idle' ? { transitionTarget: null } : {}),
    }),
  completeReturn: () => {
    if (get().transitionTarget === 'god' && get().transitionPhase === 'black')
      set({ mode: 'god' })
  },
  reset: () =>
    set({
      mode: 'god',
      transitionTarget: null,
      transitionPhase: 'idle',
      inputLocked: false,
      entryRequested: false,
      entryConfirmed: false,
      entryPlaced: false,
      entryMessage: null,
    }),
  entryRequested: false,
  entryConfirmed: false,
  entryPlaced: false,
  placeEntry: () => {
    if (get().entryRequested && !get().inputLocked)
      set({
        entryPlaced: true,
        entryMessage: 'Target placed — choose Enter or Replace.',
      })
  },
  entryMessage: null,
  entryTargetRevision: 0,
  retargetEntry: () => {
    if (get().entryRequested && !get().inputLocked)
      set((state) => ({
        entryTargetRevision: state.entryTargetRevision + 1,
        entryConfirmed: false,
        entryPlaced: false,
        entryMessage:
          'Point at a clear floor, then click the trigger or pinch to place your target.',
      }))
  },
  setMode: (mode) => {
    if (get().inputLocked) return
    if (mode === 'god' && get().mode === 'human') {
      set({
        transitionTarget: 'god',
        transitionPhase: 'fade-out',
        inputLocked: true,
      })
      return
    }
    if (mode === XR_PLAYER_MODES.GOD)
      set({
        mode,
        entryPlaced: false,
        entryRequested: false,
        entryConfirmed: false,
        entryMessage: null,
      })
    else if (get().mode !== XR_PLAYER_MODES.HUMAN)
      set({
        entryRequested: true,
        entryTargetRevision:
          get().entryTargetRevision + (get().entryRequested ? 0 : 1),
        entryConfirmed: get().entryRequested && get().entryPlaced,
        ...(get().entryRequested && get().entryPlaced
          ? ({
              transitionTarget: 'human',
              transitionPhase: 'fade-out',
              inputLocked: true,
            } as const)
          : {}),
        entryMessage: get().entryPlaced
          ? 'Entering placed target…'
          : 'Point at a clear floor, then click the trigger or pinch to place your target.',
      })
  },
  cancelEntry: () => {
    if (get().inputLocked) return
    set({
      entryRequested: false,
      entryConfirmed: false,
      entryPlaced: false,
      entryMessage: null,
    })
  },
  completeEntry: () => {
    if (
      get().entryRequested &&
      get().entryConfirmed &&
      get().entryPlaced &&
      get().transitionPhase === 'black'
    )
      set({
        mode: XR_PLAYER_MODES.HUMAN,
        entryPlaced: false,
        entryRequested: false,
        entryConfirmed: false,
        entryMessage: null,
      })
  },
  setEntryMessage: (entryMessage) => set({ entryMessage }),
  rejectEntry: (entryMessage) => set({ entryMessage, entryConfirmed: false }),
  toggle: () =>
    get().setMode(
      get().mode === XR_PLAYER_MODES.GOD
        ? XR_PLAYER_MODES.HUMAN
        : XR_PLAYER_MODES.GOD,
    ),
}))

export function toggleXRPlayerMode() {
  useXRPlayerMode.getState().toggle()
}
