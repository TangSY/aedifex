import type { ChatPersistence } from '../contracts/runtime'

/**
 * Default ChatPersistence — a sync wrapper around `sessionStorage`.
 *
 * Returns a no-op implementation when running outside a browser
 * (e.g. SSR, tests), matching zustand persist middleware's expectation
 * that the storage object exists even without window.
 */
export function createDefaultChatPersistence(): ChatPersistence {
  const hasSessionStorage =
    typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'

  if (!hasSessionStorage) {
    return {
      getItem: () => null,
      setItem: () => {
        /* no-op outside browser */
      },
      removeItem: () => {
        /* no-op outside browser */
      },
    }
  }

  return {
    getItem: (key) => window.sessionStorage.getItem(key),
    setItem: (key, value) => {
      try {
        window.sessionStorage.setItem(key, value)
      } catch {
        // Quota exceeded — silently drop, store keeps in-memory snapshot
      }
    },
    removeItem: (key) => window.sessionStorage.removeItem(key),
  }
}
