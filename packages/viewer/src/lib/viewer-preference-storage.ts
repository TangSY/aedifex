import type { StateStorage } from 'zustand/middleware'

function withStorage<T>(operation: (storage: Storage) => T, fallback: T): T {
  try {
    return operation(window.localStorage)
  } catch {
    return fallback
  }
}

export const viewerPreferenceStorage: StateStorage = {
  getItem: (key) => withStorage((storage) => storage.getItem(key), null),
  setItem: (key, value) => withStorage((storage) => storage.setItem(key, value), undefined),
  removeItem: (key) => withStorage((storage) => storage.removeItem(key), undefined),
}
