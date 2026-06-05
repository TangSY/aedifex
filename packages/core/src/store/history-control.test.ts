import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  getSceneHistoryPauseDepth,
  pauseSceneHistory,
  resetSceneHistoryPauseDepth,
  resumeSceneHistory,
} from './history-control'

// Refcount pattern mirrors space-detection-pause.test.ts: depth is module-level,
// must be reset between tests so leftover state from one case doesn't bleed.

type SpyTemporal = {
  pauseCalls: number
  resumeCalls: number
  temporal: {
    getState(): {
      pause(): void
      resume(): void
    }
  }
}

function makeSpyStore(): SpyTemporal {
  const counters = { pauseCalls: 0, resumeCalls: 0 }
  return {
    get pauseCalls() {
      return counters.pauseCalls
    },
    get resumeCalls() {
      return counters.resumeCalls
    },
    temporal: {
      getState: () => ({
        pause: () => {
          counters.pauseCalls += 1
        },
        resume: () => {
          counters.resumeCalls += 1
        },
      }),
    },
  } as SpyTemporal
}

beforeEach(() => {
  resetSceneHistoryPauseDepth()
})

afterEach(() => {
  resetSceneHistoryPauseDepth()
})

describe('pauseSceneHistory / resumeSceneHistory refcount', () => {
  test('initial depth is 0', () => {
    expect(getSceneHistoryPauseDepth()).toBe(0)
  })

  test('first pause calls temporal.pause(); depth becomes 1', () => {
    const store = makeSpyStore()
    pauseSceneHistory(store)
    expect(store.pauseCalls).toBe(1)
    expect(getSceneHistoryPauseDepth()).toBe(1)
  })

  test('second pause does NOT call temporal.pause(); depth becomes 2', () => {
    const store = makeSpyStore()
    pauseSceneHistory(store)
    pauseSceneHistory(store)
    expect(store.pauseCalls).toBe(1) // still 1 — already paused
    expect(getSceneHistoryPauseDepth()).toBe(2)
  })

  test('depth 1→2→1 only calls temporal.pause() once and never resumes', () => {
    const store = makeSpyStore()
    pauseSceneHistory(store) // depth 0→1, pause()
    pauseSceneHistory(store) // depth 1→2, no-op
    expect(store.pauseCalls).toBe(1)
    expect(store.resumeCalls).toBe(0)

    resumeSceneHistory(store) // depth 2→1, no-op (still paused)
    expect(getSceneHistoryPauseDepth()).toBe(1)
    expect(store.resumeCalls).toBe(0) // resume not called yet
  })

  test('balanced pause/resume eventually calls temporal.resume()', () => {
    const store = makeSpyStore()
    pauseSceneHistory(store)
    pauseSceneHistory(store)
    resumeSceneHistory(store)
    resumeSceneHistory(store)
    expect(getSceneHistoryPauseDepth()).toBe(0)
    expect(store.pauseCalls).toBe(1)
    expect(store.resumeCalls).toBe(1)
  })

  test('extra resume at depth=0 is a no-op (does NOT call temporal.resume, depth stays 0)', () => {
    const store = makeSpyStore()
    resumeSceneHistory(store)
    resumeSceneHistory(store)
    expect(getSceneHistoryPauseDepth()).toBe(0)
    expect(store.resumeCalls).toBe(0)
    expect(store.pauseCalls).toBe(0)
  })

  test('resetSceneHistoryPauseDepth forcibly returns depth to 0 without calling resume()', () => {
    const store = makeSpyStore()
    pauseSceneHistory(store)
    pauseSceneHistory(store)
    pauseSceneHistory(store)
    expect(getSceneHistoryPauseDepth()).toBe(3)
    resetSceneHistoryPauseDepth()
    expect(getSceneHistoryPauseDepth()).toBe(0)
    // reset is a leak-prevention measure (clearSceneHistory uses it); it
    // intentionally does NOT call temporal.resume() — the caller is expected
    // to call temporal.clear() directly.
    expect(store.resumeCalls).toBe(0)
  })

  test('deeply nested pause/resume — depth 5 still only fires temporal.pause/resume once each', () => {
    const store = makeSpyStore()
    for (let i = 0; i < 5; i += 1) {
      pauseSceneHistory(store)
    }
    expect(getSceneHistoryPauseDepth()).toBe(5)
    expect(store.pauseCalls).toBe(1)

    for (let i = 0; i < 5; i += 1) {
      resumeSceneHistory(store)
    }
    expect(getSceneHistoryPauseDepth()).toBe(0)
    expect(store.resumeCalls).toBe(1)
  })

  test('multiple independent store consumers share the same depth counter', () => {
    // Two unrelated "stores" both pausing the same global counter — this is
    // intentional: the module-level depth is shared across consumers so that
    // overlapping batches (e.g. drag-session + AI execution) don't desync.
    const storeA = makeSpyStore()
    const storeB = makeSpyStore()
    pauseSceneHistory(storeA) // depth 0→1, A.pause()
    pauseSceneHistory(storeB) // depth 1→2, B.pause() NOT called
    expect(getSceneHistoryPauseDepth()).toBe(2)
    expect(storeA.pauseCalls).toBe(1)
    expect(storeB.pauseCalls).toBe(0)

    resumeSceneHistory(storeA) // depth 2→1, no-op
    resumeSceneHistory(storeB) // depth 1→0, B.resume() called (only depth=0 transition matters)
    expect(getSceneHistoryPauseDepth()).toBe(0)
    expect(storeB.resumeCalls).toBe(1)
  })
})
