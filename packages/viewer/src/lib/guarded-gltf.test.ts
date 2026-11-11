import { expect, test } from 'bun:test'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Texture } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { loadGuardedGltf } from './guarded-gltf'

Object.assign(globalThis, { self: globalThis })
globalThis.ProgressEvent ??= class extends Event {
  constructor(type: string, init?: ProgressEventInit) {
    super(type)
    Object.assign(this, init)
  }
} as typeof ProgressEvent

const documentUrl = 'https://app.example/editor'
const modelUrl = 'https://cdn.example/model.gltf'
const allowedOrigins = new Set(['https://cdn.example'])

function fixture(image = 'texture.ktx2', buffer = 'mesh.bin') {
  return {
    asset: { version: '2.0' },
    extensionsUsed: ['KHR_texture_basisu'],
    extensionsRequired: ['KHR_texture_basisu'],
    buffers: [{ uri: buffer, byteLength: 36 }],
    bufferViews: [{ buffer: 0, byteLength: 36 }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: 'VEC3',
        max: [0, 0, 0],
        min: [0, 0, 0],
      },
    ],
    images: [{ uri: image }, { uri: 'unused.png' }],
    textures: [{ extensions: { KHR_texture_basisu: { source: 0 } } }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  }
}

function setup(model = fixture()) {
  const requests: string[] = []
  const textures: string[] = []
  const createLoader = () => {
    const loader = new GLTFLoader()
    loader.setKTX2Loader({
      load(url: string, done: (texture: Texture) => void) {
        textures.push(url)
        done(new Texture())
      },
    } as never)
    return loader
  }
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(init?.redirect).toBe('error')
    const url = String(input)
    requests.push(url)
    if (url === modelUrl) return new Response(JSON.stringify(model))
    if (url.endsWith('/mesh.bin')) return new Response(new Uint8Array(36))
    if (url.endsWith('/texture.ktx2'))
      return new Response(new Uint8Array(4), { headers: { 'content-type': 'image/ktx2' } })
    throw new Error('unexpected request')
  }) as typeof fetch
  return {
    createLoader,
    fetcher,
    requests,
    textures,
    documentUrl,
    baseUrl: documentUrl,
    allowedOrigins,
    maxBytes: 1024 * 1024,
  }
}

test('loads only used permitted glTF dependencies and restores the authored image URI', async () => {
  const run = setup()
  const result = await loadGuardedGltf({ ...run, url: modelUrl })
  expect(result.scene.children).toHaveLength(1)
  expect(result.parser.json.images[0].uri).toBe('texture.ktx2')
  expect(run.requests.sort()).toEqual(
    [modelUrl, 'https://cdn.example/mesh.bin', 'https://cdn.example/texture.ktx2'].sort(),
  )
  expect(run.textures[0]?.startsWith('blob:')).toBe(true)
  expect(
    await fetch(run.textures[0]!).then(
      () => true,
      () => false,
    ),
  ).toBe(false)
})

test('reports a blocked texture rather than accepting the parser fallback', async () => {
  const run = setup(fixture('https://other.example/x.ktx2'))
  await expect(loadGuardedGltf({ ...run, url: modelUrl })).rejects.toThrow()
  expect(run.requests.some((url) => url.includes('other.example'))).toBe(false)
})

test('reports an image read failure even when a rejection has no error value', async () => {
  const run = setup()
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith('/texture.ktx2')) return Promise.reject(undefined)
    return run.fetcher(input, init)
  }) as typeof fetch
  let rejected = false
  try {
    await loadGuardedGltf({ ...run, fetcher, url: modelUrl })
  } catch {
    rejected = true
  }
  expect(rejected).toBe(true)
})

test('reads an image only once when two texture definitions use it', async () => {
  const model = fixture()
  model.textures.push({ extensions: { KHR_texture_basisu: { source: 0 } }, sampler: 0 } as never)
  Object.assign(model, { samplers: [{}] })
  Object.assign(model.materials[0]!, { normalTexture: { index: 1 } })
  const run = setup(model)
  const result = await loadGuardedGltf({ ...run, url: modelUrl })
  expect(result.parser.json.images[0].uri).toBe('texture.ktx2')
  expect(run.requests.filter((url) => url.endsWith('/texture.ktx2'))).toHaveLength(1)
})

test('does not read a URI when the image is embedded in a buffer view', async () => {
  const model = fixture('https://other.example/unused.ktx2')
  Object.assign(model.images[0]!, { bufferView: 0, mimeType: 'image/ktx2' })
  const run = setup(model)
  const result = await loadGuardedGltf({ ...run, url: modelUrl })
  expect(result.scene.children).toHaveLength(1)
  expect(run.requests.some((url) => url.includes('other.example'))).toBe(false)
})

test('applies the shared budget to the model and its parallel dependencies', async () => {
  const run = setup()
  const maxBytes = new TextEncoder().encode(JSON.stringify(fixture())).length + 39
  await expect(loadGuardedGltf({ ...run, url: modelUrl, maxBytes })).rejects.toThrow('budget')
})

test('the model budget cannot exceed 256 MiB even if a caller requests more', async () => {
  const run = setup()
  const fetcher = (async () =>
    new Response(new Uint8Array(), {
      headers: { 'content-length': String(256 * 1024 * 1024 + 1) },
    })) as typeof fetch
  await expect(
    loadGuardedGltf({ ...run, url: modelUrl, fetcher, maxBytes: 512 * 1024 * 1024 }),
  ).rejects.toThrow('budget')
})

test('does not begin a model request after cancellation', async () => {
  const run = setup()
  const controller = new AbortController()
  controller.abort()
  await expect(
    loadGuardedGltf({ ...run, url: modelUrl, signal: controller.signal }),
  ).rejects.toMatchObject({ name: 'AbortError' })
  expect(run.requests).toHaveLength(0)
})

test('resolves a same-origin artifact through the application rather than the catalog', async () => {
  const run = setup()
  const requested: string[] = []
  const fetcher = (async (input: RequestInfo | URL) => {
    requested.push(String(input))
    return new Response(
      JSON.stringify({ asset: { version: '2.0' }, scenes: [{ nodes: [] }], scene: 0 }),
    )
  }) as typeof fetch
  await loadGuardedGltf({
    ...run,
    url: 'artifact://hash',
    baseUrl: 'https://cdn.example/',
    resolveHandle: async () => 'https://app.example/api/artifacts/hash',
    fetcher,
  })
  expect(requested).toEqual(['https://app.example/api/artifacts/hash'])
})

test('cancellation does not wait for an unresolved local handle', async () => {
  const run = setup()
  const controller = new AbortController()
  let markStarted!: () => void
  const started = new Promise<void>((resolve) => {
    markStarted = resolve
  })
  const resolveHandle = () => {
    markStarted()
    return new Promise<string | null>(() => {})
  }
  const result = loadGuardedGltf({
    ...run,
    url: 'asset://pending',
    resolveHandle,
    signal: controller.signal,
  })
  await started
  controller.abort()
  await expect(result).rejects.toMatchObject({ name: 'AbortError' })
  expect(run.requests).toHaveLength(0)
}, 1000)

test('isolates the dependencies of concurrently loaded models', async () => {
  const run = setup()
  const requests: string[] = []
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = String(input)
    requests.push(url)
    if (url.endsWith('/model.gltf')) return new Response(JSON.stringify(fixture()))
    if (url.endsWith('/mesh.bin')) return new Response(new Uint8Array(36))
    if (url.endsWith('/texture.ktx2')) return new Response(new Uint8Array(4))
    throw new Error('unexpected request')
  }) as typeof fetch
  const origins = new Set(['https://one.example', 'https://two.example'])
  await Promise.all(
    ['one', 'two'].map((host) =>
      loadGuardedGltf({
        ...run,
        fetcher,
        allowedOrigins: origins,
        url: `https://${host}.example/model.gltf`,
      }),
    ),
  )
  expect(requests.sort()).toEqual(
    ['one', 'two']
      .flatMap((host) =>
        ['model.gltf', 'mesh.bin', 'texture.ktx2'].map((path) => `https://${host}.example/${path}`),
      )
      .sort(),
  )
})

test('cancellation bounds the wait for a stalled model response', async () => {
  const run = setup()
  const controller = new AbortController()
  let markStarted!: () => void
  const started = new Promise<void>((resolve) => {
    markStarted = resolve
  })
  const fetcher = (() => {
    markStarted()
    return new Promise<Response>(() => {})
  }) as typeof fetch
  const result = loadGuardedGltf({
    ...run,
    url: modelUrl,
    fetcher,
    signal: controller.signal,
    cleanupWaitMs: 10,
  })
  await started
  controller.abort()
  await expect(result).rejects.toMatchObject({ name: 'AbortError' })
}, 1000)

test('waits for a concurrent image decoder before releasing its temporary URL', async () => {
  const run = setup()
  let accessible = false
  const createLoader = () => {
    const loader = new GLTFLoader()
    loader.setKTX2Loader({
      load(url: string, done: (texture: Texture) => void) {
        setTimeout(async () => {
          accessible = await fetch(url).then(
            () => true,
            () => false,
          )
          done(new Texture())
        }, 30)
      },
    } as never)
    return loader
  }
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith('/mesh.bin')) {
      await new Promise((resolve) => setTimeout(resolve, 10))
      throw new Error('mesh unavailable')
    }
    return run.fetcher(input, init)
  }) as typeof fetch
  await expect(loadGuardedGltf({ ...run, createLoader, fetcher, url: modelUrl })).rejects.toThrow(
    'mesh unavailable',
  )
  expect(accessible).toBe(true)
})

test('disposes a model that finishes parsing after its request was cancelled', async () => {
  const run = setup()
  const controller = new AbortController()
  const geometry = new BoxGeometry()
  const texture = new Texture()
  const material = new MeshBasicMaterial({ map: texture })
  const scene = new Group()
  const secondScene = new Group()
  scene.add(new Mesh(geometry, material))
  secondScene.add(new Mesh(geometry, material))
  const cachedTexture = new Texture()
  const cachedMaterial = new MeshBasicMaterial({ map: cachedTexture })
  cachedMaterial.userData.__aedifexCachedMaterial = true
  scene.add(new Mesh(geometry, cachedMaterial))
  const disposed: string[] = []
  cachedTexture.addEventListener('dispose', () => disposed.push('cached texture'))
  cachedMaterial.addEventListener('dispose', () => disposed.push('cached material'))
  geometry.addEventListener('dispose', () => disposed.push('geometry'))
  material.addEventListener('dispose', () => disposed.push('material'))
  texture.addEventListener('dispose', () => disposed.push('texture'))
  let finish!: (value: never) => void
  let started!: () => void
  const parsing = new Promise<never>((resolve) => {
    finish = resolve
  })
  const parsingStarted = new Promise<void>((resolve) => {
    started = resolve
  })
  const createLoader = () => {
    const loader = new GLTFLoader()
    loader.parseAsync = () => {
      started()
      return parsing
    }
    return loader
  }
  const result = loadGuardedGltf({
    ...run,
    createLoader,
    url: modelUrl,
    signal: controller.signal,
    cleanupWaitMs: 1,
  })
  await parsingStarted
  controller.abort()
  await expect(result).rejects.toMatchObject({ name: 'AbortError' })
  finish({ scene, scenes: [scene, secondScene] } as never)
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(disposed.sort()).toEqual(['geometry', 'material', 'texture'])
})
