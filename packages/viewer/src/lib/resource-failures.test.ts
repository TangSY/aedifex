import { expect, test } from 'bun:test'
import {
  getResourceFailureCount,
  retainResourceFailure,
  subscribeResourceFailures,
} from './resource-failures'

test('reports unique unavailable resources until their last consumer releases them', () => {
  let changes = 0
  const unsubscribe = subscribeResourceFailures(() => {
    changes++
  })
  const first = retainResourceFailure('asset-a')
  const second = retainResourceFailure('asset-a')
  const third = retainResourceFailure('asset-b')
  try {
    expect(getResourceFailureCount()).toBe(2)
    first()
    first()
    expect(getResourceFailureCount()).toBe(2)
    second()
    expect(getResourceFailureCount()).toBe(1)
    third()
    expect(getResourceFailureCount()).toBe(0)
    expect(changes).toBe(4)
  } finally {
    first()
    second()
    third()
    unsubscribe()
  }
})
