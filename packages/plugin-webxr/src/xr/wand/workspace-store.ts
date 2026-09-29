import { create } from 'zustand'

export const useXRWorkspace = create<{
  visible: boolean
  hide: () => void
  toggle: () => void
  modeChanged: () => void
  resetPositionRequest: number
  resetPanelPosition: () => void
  recallRequest: number
  recallReason: 'manual' | 'selection'
  recall: (reason?: 'manual' | 'selection') => void
}>((set, get) => ({
  visible: true,
  hide: () => set({ visible: false }),
  toggle: () => get().visible ? get().hide() : get().recall(),
  modeChanged: () => {
    if (get().visible) get().recall()
  },
  resetPositionRequest: 0,
  resetPanelPosition: () => set((state) => ({
    resetPositionRequest: state.resetPositionRequest + 1,
  })),
  recallRequest: 0,
  recallReason: 'manual',
  recall: (reason = 'manual') => set((state) => {
    if (reason === 'selection' && !state.visible) return state
    return {
      visible: true,
      recallRequest: state.recallRequest + 1,
      recallReason: reason,
      resetPositionRequest: state.resetPositionRequest + (reason === 'manual' ? 1 : 0),
    }
  }),
}))
