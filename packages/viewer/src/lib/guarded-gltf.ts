import {
  AssetAccessError,
  createAssetReadBudget,
  readRestrictedAsset,
  restrictedAssetUrl,
} from '@aedifex/core'
import type { BufferGeometry, Material, Texture } from 'three'
import type { GLTF, GLTFLoader, GLTFParser } from 'three/examples/jsm/loaders/GLTFLoader.js'

const MODEL_BYTE_LIMIT = 256 * 1024 * 1024

type GuardedGltfOptions = {
  url: string
  baseUrl: string
  documentUrl: string
  allowedOrigins: ReadonlySet<string>
  trustedRelativeOrigin?: string
  createLoader: () => GLTFLoader
  resolveHandle?: (url: string) => Promise<string | null>
  fetcher?: typeof fetch
  signal?: AbortSignal
  maxBytes?: number
  cleanupWaitMs?: number
}

function disposeUnclaimedGltf(gltf: GLTF): void {
  const geometries = new Set<BufferGeometry>()
  const materials = new Set<Material>()
  const textures = new Set<Texture>()
  for (const scene of new Set([gltf.scene, ...gltf.scenes])) {
    scene.traverse((object) => {
      const renderable = object as typeof object & {
        geometry?: BufferGeometry
        material?: Material | Material[]
      }
      if (renderable.geometry) geometries.add(renderable.geometry)
      const entries = Array.isArray(renderable.material)
        ? renderable.material
        : [renderable.material]
      for (const material of entries) {
        if (!material || material.userData?.__aedifexCachedMaterial) continue
        materials.add(material)
        for (const value of Object.values(material)) {
          if (value && typeof value === 'object' && (value as Texture).isTexture)
            textures.add(value as Texture)
        }
      }
    })
  }
  for (const geometry of geometries) geometry.dispose()
  for (const material of materials) material.dispose()
  for (const texture of textures) texture.dispose()
}

export async function loadGuardedGltf({
  url,
  baseUrl,
  documentUrl,
  allowedOrigins,
  trustedRelativeOrigin,
  createLoader,
  resolveHandle,
  fetcher,
  signal,
  maxBytes = MODEL_BYTE_LIMIT,
  cleanupWaitMs = 1000,
}: GuardedGltfOptions): Promise<GLTF> {
  const budget = createAssetReadBudget(Math.min(maxBytes, MODEL_BYTE_LIMIT))
  const loader = createLoader()
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) controller.abort()
  const pending = new Set<Promise<unknown>>()
  const objectUrls = new Set<string>()
  let failure: unknown
  let hasFailure = false
  let modelBase = baseUrl
  let parsed: GLTF | undefined
  let delivered = false
  const read = (resource: string, base: string) =>
    readRestrictedAsset({
      url: resource,
      baseUrl: base,
      documentUrl,
      allowedOrigins,
      trustedRelativeOrigin,
      budget,
      fetcher,
      signal: controller.signal,
    })
  const track = <T>(promise: Promise<T>): Promise<T> => {
    pending.add(promise)
    promise.then(
      () => pending.delete(promise),
      (error) => {
        pending.delete(promise)
        if (!hasFailure) failure = error
        hasFailure = true
      },
    )
    return promise
  }

  const plugin = (parser: GLTFParser) => ({
    name: 'aedifex-guarded-asset-read',
    beforeRoot() {
      const loadBuffer = parser.loadBuffer.bind(parser)
      const loadImage = parser.loadImageSource.bind(parser)
      const buffers = new Map<number, Promise<ArrayBuffer>>()
      const images = new Map<number, Promise<string>>()
      parser.loadBuffer = (index) => {
        const uri = parser.json.buffers[index]?.uri
        if (!uri || /^data:/i.test(uri)) return loadBuffer(index)
        let result = buffers.get(index)
        if (!result) {
          result = track(read(uri, modelBase).then(({ bytes }) => bytes.buffer as ArrayBuffer))
          buffers.set(index, result)
        }
        return result
      }
      parser.loadImageSource = (index, imageLoader) =>
        track(
          (async () => {
            const definition = parser.json.images[index]
            const uri = definition?.uri
            if (definition?.bufferView !== undefined || !uri || /^data:/i.test(uri))
              return loadImage(index, imageLoader)
            let result = images.get(index)
            if (!result) {
              result = track(
                read(uri, modelBase).then(({ bytes, contentType }) => {
                  if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
                  const objectUrl = URL.createObjectURL(
                    new Blob([bytes as BlobPart], { type: contentType }),
                  )
                  objectUrls.add(objectUrl)
                  return objectUrl
                }),
              )
              images.set(index, result)
            }
            definition.uri = await result
            try {
              const loading = loadImage(index, imageLoader)
              definition.uri = uri
              return await loading
            } finally {
              definition.uri = uri
            }
          })(),
        )
      return null
    },
  })
  loader.register(plugin)
  try {
    const aborted = new Promise<never>((_, reject) => {
      if (controller.signal.aborted) reject(new DOMException('Aborted', 'AbortError'))
      else
        controller.signal.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        )
    })
    const isHandle = url.startsWith('asset://') || url.startsWith('artifact://')
    let source = await Promise.race([
      Promise.resolve().then(() => {
        if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
        return isHandle ? resolveHandle?.(url) : url
      }),
      aborted,
    ])
    if (!source) throw new AssetAccessError('Asset is unavailable')
    let sourceBase = baseUrl
    if (isHandle && source.startsWith('https://')) {
      const resolved = new URL(source)
      if (resolved.origin === new URL(documentUrl).origin) {
        source = `${resolved.pathname}${resolved.search}${resolved.hash}`
        sourceBase = documentUrl
      }
    }
    const root = restrictedAssetUrl({
      url: source,
      baseUrl: sourceBase,
      documentUrl,
      allowedOrigins,
      trustedRelativeOrigin,
    })
    modelBase =
      root.startsWith('blob:') || root.startsWith('data:') ? documentUrl : new URL('.', root).href
    const { bytes } = await Promise.race([track(read(source, sourceBase)), aborted])
    const gltf = await Promise.race([
      loader.parseAsync(bytes.buffer as ArrayBuffer, modelBase).then((gltf) => {
        if (controller.signal.aborted) disposeUnclaimedGltf(gltf)
        else parsed = gltf
        return gltf
      }),
      aborted,
    ])
    if (hasFailure)
      throw failure instanceof AssetAccessError
        ? failure
        : new AssetAccessError('Asset is unavailable')
    delivered = true
    return gltf
  } finally {
    controller.abort()
    if (parsed && !delivered) disposeUnclaimedGltf(parsed)
    let timer: ReturnType<typeof setTimeout> | undefined
    await Promise.race([
      Promise.allSettled([...pending]),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, cleanupWaitMs)
      }),
    ])
    if (timer) clearTimeout(timer)
    for (const objectUrl of objectUrls) URL.revokeObjectURL(objectUrl)
    loader.unregister(plugin)
    signal?.removeEventListener('abort', abort)
  }
}
