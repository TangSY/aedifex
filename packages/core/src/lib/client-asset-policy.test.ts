import { expect, test } from 'bun:test'
import {
  configureClientAssetPolicy,
  getClientAssetPolicy,
  subscribeClientAssetPolicy,
} from './client-asset-policy'

test('publishes normalized policy changes and refuses malformed policy without relaxing the current policy', () => {
  let notifications = 0
  const unsubscribe = subscribeClientAssetPolicy(() => {
    notifications++
  })
  try {
    configureClientAssetPolicy(['https://b.example', 'https://a.example', 'https://b.example'])
    const current = getClientAssetPolicy()
    expect(current.origins).toEqual(['https://a.example', 'https://b.example'])
    expect(Object.isFrozen(current.origins)).toBe(true)
    configureClientAssetPolicy(['https://a.example', 'https://b.example'])
    expect(getClientAssetPolicy()).toBe(current)
    expect(notifications).toBe(1)
    expect(() => configureClientAssetPolicy(['https://a.example/path'])).toThrow()
    expect(getClientAssetPolicy()).toBe(current)
    configureClientAssetPolicy(null)
    expect(getClientAssetPolicy().origins).toBeNull()
    expect(notifications).toBe(2)
  } finally {
    unsubscribe()
    configureClientAssetPolicy(null)
  }
})
