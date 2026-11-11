import { expect, mock, test } from 'bun:test'
import { configureClientAssetPolicy, getClientAssetPolicy } from '@aedifex/core'
import { LoadingManager, Texture } from 'three'
import { installBrowserFixture } from '../__tests__/browser-fixture'
import {
  GuardedViewerGLTFLoader,
  guardedViewerModelKey,
  isGuardedGltfUnavailable,
} from './guarded-viewer-loader'

const valid = JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{}] })
function key(source: string) {
  return guardedViewerModelKey({
    source,
    resolvedUrl: source,
    version: getClientAssetPolicy().version,
  })
}

test('viewer loader rejects an unlisted model before any request', async () => {
  const restore = installBrowserFixture()
  const fetcher = mock(async () => new Response(valid))
  const previous = globalThis.fetch
  globalThis.fetch = fetcher as typeof fetch
  configureClientAssetPolicy(['https://allowed.example'])
  const manager = new LoadingManager()
  let ended = 0
  manager.onLoad = () => {
    ended++
  }
  try {
    const result = await new GuardedViewerGLTFLoader(manager).loadAsync(
      key('https://other.example/model.gltf'),
    )
    expect(isGuardedGltfUnavailable(result)).toBe(true)
    expect(fetcher).not.toHaveBeenCalled()
    expect(ended).toBe(1)
  } finally {
    configureClientAssetPolicy(null)
    globalThis.fetch = previous
    restore()
  }
})

test('capture glTF validates authored and resolved locations before loading', async () => {
  const restore = installBrowserFixture()
  const previous = globalThis.fetch
  const fetcher = mock(async () => new Response(valid))
  globalThis.fetch = fetcher as typeof fetch
  configureClientAssetPolicy(['https://allowed.example'])
  const request = (source: string, resolvedUrl: string) =>
    guardedViewerModelKey({
      source,
      resolvedUrl,
      version: getClientAssetPolicy().version,
      validateResolved: true,
    })
  try {
    const loader = new GuardedViewerGLTFLoader()
    const blockedSource = await loader.loadAsync(
      request('https://blocked.example/a.glb', 'blob:https://app.example/local'),
    )
    const blockedTarget = await loader.loadAsync(request('/a.glb', 'https://blocked.example/a.glb'))
    expect(isGuardedGltfUnavailable(blockedSource)).toBe(true)
    expect(isGuardedGltfUnavailable(blockedTarget)).toBe(true)
    expect(fetcher).not.toHaveBeenCalled()
    const allowed = await loader.loadAsync(request('/a.gltf', 'https://allowed.example/a.gltf'))
    expect(isGuardedGltfUnavailable(allowed)).toBe(false)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://allowed.example/a.gltf')
  } finally {
    configureClientAssetPolicy(null)
    globalThis.fetch = previous
    restore()
  }
})

test('viewer loader parses an allowed model with no redirects', async () => {
  const restore = installBrowserFixture()
  const previous = globalThis.fetch
  const fetcher = mock(async (_url: RequestInfo | URL, init?: RequestInit) => {
    expect(init?.redirect).toBe('error')
    return new Response(valid)
  })
  globalThis.fetch = fetcher as typeof fetch
  configureClientAssetPolicy(['https://allowed.example'])
  try {
    const result = await new GuardedViewerGLTFLoader().loadAsync(
      key('https://allowed.example/model.gltf'),
    )
    expect(isGuardedGltfUnavailable(result)).toBe(false)
    expect(result.asset.version).toBe('2.0')
    expect(fetcher).toHaveBeenCalledTimes(1)
  } finally {
    configureClientAssetPolicy(null)
    globalThis.fetch = previous
    restore()
  }
})

test('viewer loader refuses a stale policy key without a request', async () => {
  const restore = installBrowserFixture()
  const previous = globalThis.fetch
  const fetcher = mock(async () => new Response(valid))
  globalThis.fetch = fetcher as typeof fetch
  configureClientAssetPolicy(['https://allowed.example'])
  const stale = key('https://allowed.example/model.gltf')
  configureClientAssetPolicy([])
  try {
    const result = await new GuardedViewerGLTFLoader().loadAsync(stale)
    expect(isGuardedGltfUnavailable(result)).toBe(true)
    expect(fetcher).not.toHaveBeenCalled()
  } finally {
    configureClientAssetPolicy(null)
    globalThis.fetch = previous
    restore()
  }
})

test('the stdlib parser blocks a referenced texture from an unlisted origin', async () => {
  const restore = installBrowserFixture()
  const previous = globalThis.fetch
  const requested: string[] = []
  const model = {
    asset: { version: '2.0' },
    extensionsUsed: ['KHR_texture_basisu'],
    extensionsRequired: ['KHR_texture_basisu'],
    buffers: [{ uri: 'mesh.bin', byteLength: 36 }],
    bufferViews: [{ buffer: 0, byteLength: 36 }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: 'VEC3',
        min: [0, 0, 0],
        max: [0, 0, 0],
      },
    ],
    images: [{ uri: 'https://other.example/image.ktx2' }],
    textures: [{ extensions: { KHR_texture_basisu: { source: 0 } } }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  }
  globalThis.fetch = mock(async (input: RequestInfo | URL) => {
    const url = String(input)
    requested.push(url)
    if (url.endsWith('/model.gltf')) return new Response(JSON.stringify(model))
    if (url.endsWith('/mesh.bin')) return new Response(new Uint8Array(36))
    throw new Error('unexpected request')
  }) as typeof fetch
  configureClientAssetPolicy(['https://allowed.example'])
  const loader = new GuardedViewerGLTFLoader()
  loader.setKTX2Loader({
    load(_url: string, done: (texture: Texture) => void) {
      done(new Texture())
    },
  } as never)
  try {
    const result = await loader.loadAsync(key('https://allowed.example/model.gltf'))
    expect(isGuardedGltfUnavailable(result)).toBe(true)
    expect(requested.some((url) => url.includes('other.example'))).toBe(false)
  } finally {
    configureClientAssetPolicy(null)
    globalThis.fetch = previous
    restore()
  }
})
