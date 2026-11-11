import { afterEach, expect, mock, test } from 'bun:test'
import { configureClientAssetPolicy, getClientAssetPolicy } from '@aedifex/core'
import { ASSETS_CDN_URL, resolveCdnUrl } from '@aedifex/viewer'
import { LoadingManager } from 'three'
import {
  getPendingItemModelLoadCount,
  getUnavailableItemAsset,
  guardedItemModelKey,
  ItemGLTFLoader,
} from './model-loader'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  configureClientAssetPolicy(null)
})

const valid = JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{}] })

function installBrowserFixture() {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const originalSelf = Object.getOwnPropertyDescriptor(globalThis, 'self')
  Object.defineProperty(globalThis, 'window', {
    value: { location: new URL('https://app.example/editor') },
    configurable: true,
  })
  Object.defineProperty(globalThis, 'self', { value: globalThis, configurable: true })
  return () => {
    for (const [key, descriptor] of [
      ['window', originalWindow],
      ['self', originalSelf],
    ] as const) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
}

function key(source: string, resolvedUrl = source) {
  return guardedItemModelKey({ source, resolvedUrl, version: getClientAssetPolicy().version })
}

test('blocked explicit item sources resolve unavailable without making a network request', async () => {
  const restore = installBrowserFixture()
  const fetcher = mock(async () => new Response(valid))
  globalThis.fetch = fetcher as typeof fetch
  configureClientAssetPolicy(['https://allowed.example'])
  const manager = new LoadingManager()
  try {
    const result = await new ItemGLTFLoader(manager, []).loadAsync(
      key('https://other.example/model.gltf'),
    )
    expect(getUnavailableItemAsset(result)?.url).toBe('https://other.example/model.gltf')
    expect(fetcher).not.toHaveBeenCalled()
    expect(getPendingItemModelLoadCount(manager)).toBe(0)
  } finally {
    restore()
  }
})

test('retries a transient guarded item request and preserves its original URL', async () => {
  const restore = installBrowserFixture()
  let attempt = 0
  const fetcher = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
    expect(init?.redirect).toBe('error')
    return ++attempt === 1 ? new Response(null, { status: 503 }) : new Response(valid)
  })
  globalThis.fetch = fetcher as typeof fetch
  configureClientAssetPolicy(['https://allowed.example'])
  const manager = new LoadingManager()
  try {
    const result = await new ItemGLTFLoader(manager, [0]).loadAsync(
      key('https://allowed.example/model.gltf'),
    )
    expect(getUnavailableItemAsset(result)).toBeNull()
    expect(attempt).toBe(2)
    expect(getPendingItemModelLoadCount(manager)).toBe(0)
  } finally {
    restore()
  }
})

test('a stale policy key never starts a request', async () => {
  const restore = installBrowserFixture()
  const fetcher = mock(async () => new Response(valid))
  globalThis.fetch = fetcher as typeof fetch
  configureClientAssetPolicy(['https://allowed.example'])
  const stale = key('https://allowed.example/model.gltf')
  configureClientAssetPolicy([])
  try {
    const result = await new ItemGLTFLoader(undefined, []).loadAsync(stale)
    expect(getUnavailableItemAsset(result)).not.toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
  } finally {
    restore()
  }
})

test('unreadable cross-origin responses become unavailable regardless of browser error wording', async () => {
  const restore = installBrowserFixture()
  globalThis.fetch = mock(async () => {
    throw new TypeError('Load failed')
  }) as typeof fetch
  configureClientAssetPolicy(['https://allowed.example'])
  try {
    const result = await new ItemGLTFLoader(undefined, []).loadAsync(
      key('https://allowed.example/model.gltf'),
    )
    expect(getUnavailableItemAsset(result)).not.toBeNull()
  } finally {
    restore()
  }
})

test('keeps host catalog paths working but refuses scheme-relative source paths', async () => {
  const restore = installBrowserFixture()
  const fetcher = mock(async (_input: RequestInfo | URL) => new Response(valid))
  globalThis.fetch = fetcher as typeof fetch
  configureClientAssetPolicy([])
  try {
    const source = '/items/chair/model.glb'
    const result = await new ItemGLTFLoader(undefined, []).loadAsync(
      key(source, resolveCdnUrl(source)!),
    )
    expect(getUnavailableItemAsset(result)).toBeNull()
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(`${ASSETS_CDN_URL}${source}`)
    const unsafe = '//other.example/model.glb'
    const blocked = await new ItemGLTFLoader(undefined, []).loadAsync(
      key(unsafe, resolveCdnUrl(unsafe)!),
    )
    expect(getUnavailableItemAsset(blocked)).not.toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(1)
  } finally {
    restore()
  }
})

test('aborts the active model read if its policy changes', async () => {
  const restore = installBrowserFixture()
  let signal: AbortSignal | null | undefined
  let markStarted!: () => void
  const started = new Promise<void>((resolve) => {
    markStarted = resolve
  })
  globalThis.fetch = mock((_input: RequestInfo | URL, init?: RequestInit) => {
    signal = init?.signal
    markStarted()
    return new Promise<Response>((_resolve, reject) =>
      signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
        once: true,
      }),
    )
  }) as typeof fetch
  configureClientAssetPolicy(['https://allowed.example'])
  const manager = new LoadingManager()
  const pending = new ItemGLTFLoader(manager, []).loadAsync(
    key('https://allowed.example/model.gltf'),
  )
  try {
    await started
    configureClientAssetPolicy([])
    const result = await pending
    expect(signal?.aborted).toBe(true)
    expect(getUnavailableItemAsset(result)).not.toBeNull()
    expect(getPendingItemModelLoadCount(manager)).toBe(0)
  } finally {
    restore()
  }
})
