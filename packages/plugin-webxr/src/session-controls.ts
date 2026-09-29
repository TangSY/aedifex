import { create } from 'zustand'
import type { XRPlayerMode } from './xr/mode-switching/store/player-mode'

export type WebXRSessionControls = {
  ready: boolean
  unavailable: boolean
  active: boolean
  entering: boolean
  error: string | null
  enter: () => Promise<void>
  exit: () => Promise<void>
}

export const useWebXRSessionControls = create<{
  owner: object | null
  controls: WebXRSessionControls | null
  startingMode: XRPlayerMode
  setStartingMode: (mode: XRPlayerMode) => void
  publish: (owner: object, controls: WebXRSessionControls) => void
  clear: (owner: object) => void
}>((set) => ({
  owner: null,
  controls: null,
  startingMode: 'god',
  setStartingMode: startingMode => set({ startingMode }),
  publish: (owner, controls) => set({ owner, controls }),
  clear: owner => set(state => state.owner === owner ? { owner: null, controls: null } : {}),
}))
