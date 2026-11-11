import {
  AssetAccessError,
  AssetNetworkError,
  getClientAssetPolicy,
  isSchemeRelativeAssetUrl,
  loadAssetUrl,
  subscribeClientAssetPolicy,
} from '@aedifex/core'
import {
  guardedCdnLocation,
  loadGuardedGltf,
  preserveGltfUnlit,
  resolveCdnUrl,
} from '@aedifex/viewer'
import { DefaultLoadingManager, Group, LoadingManager } from 'three'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { type GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const ITEM_ASSET_UNAVAILABLE_KEY = 'aedifexItemAssetUnavailable'
const ITEM_RESOURCE_FAILURES_KEY = 'aedifexItemResourceFailures'
const DEFAULT_RETRY_DELAYS_MS = [1_000, 3_000] as const
const itemLoadGenerations = new Map<string, number>()
const guardedControllers = new Map<string, Set<AbortController>>()
const pendingItemModelLoads = new WeakMap<LoadingManager, number>()
const malformedItemJsonErrors = new WeakSet<Error>()

/** Active item transactions on this host manager, including their retry waits. */
export function getPendingItemModelLoadCount(manager = DefaultLoadingManager): number {
  return pendingItemModelLoads.get(manager) ?? 0
}

type HttpErrorLike = Error & {
  response?: { status?: number }
}

export type ItemAssetUnavailable = {
  message: string
  url: string
}

export type ItemModelLoadFailureKind = 'retryable' | 'unavailable' | 'unexpected'

export function classifyItemModelLoadFailure(error: unknown): ItemModelLoadFailureKind {
  if (!(error instanceof Error)) return 'unexpected'
  if (malformedItemJsonErrors.has(error)) return 'unavailable'

  const status = (error as HttpErrorLike).response?.status
  if (
    status === 408 ||
    status === 425 ||
    status === 429 ||
    (status !== undefined && status >= 500)
  ) {
    return 'retryable'
  }
  if (status !== undefined && status >= 400 && status < 500) return 'unavailable'
  if (error instanceof AssetNetworkError) return 'retryable'
  if (error instanceof AssetAccessError) return 'unavailable'
  if (error instanceof TypeError && /failed to fetch/i.test(error.message)) return 'retryable'

  return 'unexpected'
}

export function createUnavailableItemGltf(url: string, error: unknown): GLTF {
  const unavailable: ItemAssetUnavailable = {
    message: error instanceof Error ? error.message : String(error),
    url,
  }
  const scene = new Group()
  scene.userData[ITEM_ASSET_UNAVAILABLE_KEY] = unavailable

  return {
    animations: [],
    asset: { version: '2.0' },
    cameras: [],
    parser: null as never,
    scene,
    scenes: [scene],
    userData: { [ITEM_ASSET_UNAVAILABLE_KEY]: unavailable },
  }
}

export function getUnavailableItemAsset(gltf: GLTF): ItemAssetUnavailable | null {
  const value = gltf.userData?.[ITEM_ASSET_UNAVAILABLE_KEY]
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<ItemAssetUnavailable>
  return typeof candidate.url === 'string' && typeof candidate.message === 'string'
    ? { url: candidate.url, message: candidate.message }
    : null
}

/** GLTFLoader can resolve a model after a referenced texture failed. */
export function getItemResourceFailures(gltf: Pick<GLTF, 'userData'>): string[] {
  const failures = gltf.userData?.[ITEM_RESOURCE_FAILURES_KEY]
  return Array.isArray(failures)
    ? failures.filter((url): url is string => typeof url === 'string')
    : []
}

export function cancelItemModelLoad(url: string) {
  itemLoadGenerations.set(url, (itemLoadGenerations.get(url) ?? 0) + 1)
  for (const controller of guardedControllers.get(url) ?? []) controller.abort()
}

const GUARDED_ITEM_PREFIX = 'aedifex-guarded-item:'
type GuardedItemRequest = { source: string; resolvedUrl: string; version: number }

export function isGuardedItemModelKey(key: string): boolean {
  return key.startsWith(GUARDED_ITEM_PREFIX)
}

export function guardedItemModelKey(request: GuardedItemRequest): string {
  return `${GUARDED_ITEM_PREFIX}${encodeURIComponent(JSON.stringify(request))}`
}

function parseGuardedItemKey(key: string): GuardedItemRequest | null {
  if (!isGuardedItemModelKey(key)) return null
  try {
    const value: unknown = JSON.parse(decodeURIComponent(key.slice(GUARDED_ITEM_PREFIX.length)))
    if (!value || typeof value !== 'object') throw new Error()
    const record = value as Record<string, unknown>
    if (
      typeof record.source !== 'string' ||
      typeof record.resolvedUrl !== 'string' ||
      !Number.isSafeInteger(record.version)
    )
      throw new Error()
    return {
      source: record.source,
      resolvedUrl: record.resolvedUrl,
      version: record.version as number,
    }
  } catch {
    throw new AssetAccessError('Asset URL is unavailable')
  }
}

export class ItemGLTFLoader extends GLTFLoader {
  readonly hostManager: LoadingManager
  readonly retryDelaysMs: readonly number[]
  private resourceFailureVersion = 0
  private readonly resourceFailures = new Map<string, number>()

  constructor(
    manager?: LoadingManager,
    retryDelaysMs: readonly number[] = DEFAULT_RETRY_DELAYS_MS,
  ) {
    super(new LoadingManager())
    this.register(preserveGltfUnlit)
    this.manager.onError = (url) => {
      this.resourceFailures.set(url, ++this.resourceFailureVersion)
    }
    this.setMeshoptDecoder(MeshoptDecoder)
    this.hostManager = manager ?? DefaultLoadingManager
    this.retryDelaysMs = retryDelaysMs
  }

  override parse(
    data: ArrayBuffer | string,
    path: string,
    onLoad: (gltf: GLTF) => void,
    onError?: (event: ErrorEvent) => void,
  ): void {
    try {
      super.parse(data, path, onLoad, onError)
    } catch (error) {
      if (error instanceof SyntaxError) {
        const text = typeof data === 'string' ? data : new TextDecoder().decode(data)
        // Confirm invalid asset JSON, rather than classifying a plugin's or
        // consumer's SyntaxError as unavailable. Leave native GLB parsing alone.
        if (typeof data === 'string' || !text.startsWith('glTF')) {
          try {
            JSON.parse(text)
          } catch (parseError) {
            if (parseError instanceof SyntaxError) malformedItemJsonErrors.add(error)
          }
        }
      }
      throw error
    }
  }

  override load(
    url: string,
    onLoad: (gltf: GLTF) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (error: unknown) => void,
  ): void {
    const generation = itemLoadGenerations.get(url) ?? 0
    const resourceVersion = this.resourceFailureVersion
    let retryCount = 0
    let finished = false
    let displayUrl = url

    const wasCancelled = () => (itemLoadGenerations.get(url) ?? 0) !== generation
    const end = () => {
      pendingItemModelLoads.set(
        this.hostManager,
        getPendingItemModelLoadCount(this.hostManager) - 1,
      )
      this.hostManager.itemEnd(url)
    }

    const cancel = () => {
      if (finished) return
      finished = true
      end()
    }

    const complete = (gltf: GLTF) => {
      if (finished) return
      if (wasCancelled()) {
        cancel()
        return
      }
      finished = true
      try {
        // Keep the live model's existing fallback behavior; only make known
        // missing resources observable to capture readiness. Concurrent loads
        // on this manager are deliberately conservative.
        const failures = [...this.resourceFailures]
          .filter(([failedUrl, version]) => failedUrl !== url && version > resourceVersion)
          .map(([failedUrl]) => failedUrl)
        if (failures.length) gltf.userData[ITEM_RESOURCE_FAILURES_KEY] = failures
        onLoad(gltf)
      } finally {
        end()
      }
    }

    const fail = (error: unknown) => {
      if (finished) return
      if (wasCancelled()) {
        cancel()
        return
      }
      finished = true
      try {
        if (onError) onError(error)
        else console.error(error)
      } finally {
        try {
          this.hostManager.itemError(url)
        } finally {
          end()
        }
      }
    }

    const handleFailure = (error: unknown) => {
      if (finished) return
      if (wasCancelled()) {
        cancel()
        return
      }
      const kind = classifyItemModelLoadFailure(error)
      if (kind === 'unexpected') {
        fail(error)
        return
      }
      if (kind === 'unavailable' || retryCount >= this.retryDelaysMs.length) {
        complete(createUnavailableItemGltf(displayUrl, error))
        return
      }
      const delay = this.retryDelaysMs[retryCount] ?? 0
      retryCount += 1
      setTimeout(attempt, delay)
    }

    const attempt = () => {
      if (wasCancelled()) {
        cancel()
        return
      }
      try {
        const guarded = parseGuardedItemKey(url)
        if (!guarded) {
          super.load(url, complete, onProgress, handleFailure)
          return
        }
        displayUrl = guarded.resolvedUrl
        const policy = getClientAssetPolicy()
        if (policy.origins === null || policy.version !== guarded.version)
          throw new AssetAccessError('Asset policy changed')
        if (
          isSchemeRelativeAssetUrl(guarded.source) ||
          resolveCdnUrl(guarded.source) !== guarded.resolvedUrl
        )
          throw new AssetAccessError('Asset URL is unavailable')

        const documentUrl = window.location.href
        const { source, baseUrl, trustedRelativeOrigin } = guardedCdnLocation({
          source: guarded.source,
          resolvedUrl: guarded.resolvedUrl,
          documentUrl,
        })

        const controller = new AbortController()
        const controllers = guardedControllers.get(url) ?? new Set<AbortController>()
        controllers.add(controller)
        guardedControllers.set(url, controllers)
        const unsubscribe = subscribeClientAssetPolicy(() => {
          if (getClientAssetPolicy().version !== guarded.version) controller.abort()
        })
        if (getClientAssetPolicy().version !== guarded.version) controller.abort()
        const release = () => {
          unsubscribe()
          controllers.delete(controller)
          if (controllers.size === 0) guardedControllers.delete(url)
        }
        const createLoader = () => {
          const inner = new ItemGLTFLoader(undefined, [])
          const sourceInternals = this as unknown as { pluginCallbacks: unknown[] }
          const targetInternals = inner as unknown as { pluginCallbacks: unknown[] }
          targetInternals.pluginCallbacks = [...sourceInternals.pluginCallbacks]
          inner.setDRACOLoader(this.dracoLoader)
          inner.setKTX2Loader(this.ktx2Loader)
          inner.setMeshoptDecoder(this.meshoptDecoder)
          return inner
        }
        void loadGuardedGltf({
          url: source,
          baseUrl,
          documentUrl,
          allowedOrigins: new Set(policy.origins),
          trustedRelativeOrigin,
          createLoader,
          resolveHandle: loadAssetUrl,
          signal: controller.signal,
        }).then(
          (gltf) => {
            release()
            complete(gltf)
          },
          (error) => {
            release()
            if (controller.signal.aborted && getClientAssetPolicy().version !== guarded.version) {
              complete(
                createUnavailableItemGltf(displayUrl, new AssetAccessError('Asset policy changed')),
              )
            } else handleFailure(error)
          },
        )
      } catch (error) {
        if (finished) throw error
        if (error instanceof AssetAccessError) handleFailure(error)
        else fail(error)
      }
    }

    pendingItemModelLoads.set(this.hostManager, getPendingItemModelLoadCount(this.hostManager) + 1)
    try {
      this.hostManager.itemStart(url)
    } catch (error) {
      finished = true
      end()
      throw error
    }
    attempt()
  }
}
