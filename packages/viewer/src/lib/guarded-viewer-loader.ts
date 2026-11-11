import {
  AssetAccessError,
  getClientAssetPolicy,
  loadAssetUrl,
  subscribeClientAssetPolicy,
} from '@aedifex/core'
import { Group, type LoadingManager } from 'three'
import type { GLTFLoader as ThreeGltfLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { type GLTF, GLTFLoader } from 'three-stdlib'
import { loadGuardedGltf } from './guarded-gltf'
import { guardedResolvedLocation } from './guarded-resolved-location'

const PREFIX = 'aedifex-guarded-viewer:'
const UNAVAILABLE = 'aedifexGuardedResourceUnavailable'
type Request = { source: string; resolvedUrl: string; version: number; validateResolved?: boolean }

export function guardedViewerModelKey(request: Request): string {
  return `${PREFIX}${encodeURIComponent(JSON.stringify(request))}`
}

function parseKey(key: string): Request {
  try {
    if (!key.startsWith(PREFIX)) throw new Error()
    const value: unknown = JSON.parse(decodeURIComponent(key.slice(PREFIX.length)))
    if (!value || typeof value !== 'object') throw new Error()
    const record = value as Record<string, unknown>
    if (
      typeof record.source !== 'string' ||
      typeof record.resolvedUrl !== 'string' ||
      !Number.isSafeInteger(record.version) ||
      (record.validateResolved !== undefined && typeof record.validateResolved !== 'boolean')
    )
      throw new Error()
    return {
      source: record.source,
      resolvedUrl: record.resolvedUrl,
      version: record.version as number,
      validateResolved: record.validateResolved as boolean | undefined,
    }
  } catch {
    throw new AssetAccessError('Asset URL is unavailable')
  }
}

export function isGuardedGltfUnavailable(gltf: GLTF): boolean {
  return gltf.userData?.[UNAVAILABLE] === true
}

function unavailableGltf(): GLTF {
  const scene = new Group()
  return {
    scene,
    scenes: [scene],
    animations: [],
    cameras: [],
    asset: { version: '2.0' },
    parser: null as never,
    userData: { [UNAVAILABLE]: true },
  }
}

export class GuardedViewerGLTFLoader extends GLTFLoader {
  constructor(manager?: LoadingManager) {
    super(manager)
  }

  override load(
    url: string,
    onLoad: (gltf: GLTF) => void,
    _onProgress?: (event: ProgressEvent) => void,
    onError?: (error: ErrorEvent) => void,
  ): void {
    let ended = false
    const end = () => {
      if (!ended) {
        ended = true
        this.manager.itemEnd(url)
      }
    }
    const unavailable = () => {
      try {
        onLoad(unavailableGltf())
      } finally {
        end()
      }
    }
    const fail = (error: unknown) => {
      try {
        if (onError) onError(error as ErrorEvent)
        else console.error(error)
      } finally {
        try {
          this.manager.itemError(url)
        } finally {
          end()
        }
      }
    }
    try {
      this.manager.itemStart(url)
    } catch (error) {
      end()
      throw error
    }
    let request: Request
    try {
      request = parseKey(url)
      const policy = getClientAssetPolicy()
      if (policy.origins === null || policy.version !== request.version) {
        unavailable()
        return
      }
      const documentUrl = window.location.href
      const sourceUrl = request.validateResolved
        ? guardedResolvedLocation({
            sourceUrl: request.source || undefined,
            resolvedUrl: request.resolvedUrl,
            documentUrl,
            origins: policy.origins,
          })
        : request.source
      const controller = new AbortController()
      const unsubscribe = subscribeClientAssetPolicy(() => {
        if (getClientAssetPolicy().version !== request.version) controller.abort()
      })
      if (getClientAssetPolicy().version !== request.version) controller.abort()
      const createLoader = () => {
        const inner = new GLTFLoader()
        type Internals = {
          pluginCallbacks: unknown[]
          dracoLoader: unknown
          ktx2Loader: unknown
          meshoptDecoder: unknown
        }
        const source = this as unknown as Internals
        const target = inner as unknown as Internals
        target.pluginCallbacks = [...source.pluginCallbacks]
        target.dracoLoader = source.dracoLoader
        target.ktx2Loader = source.ktx2Loader
        target.meshoptDecoder = source.meshoptDecoder
        return inner as unknown as ThreeGltfLoader
      }
      void loadGuardedGltf({
        url: sourceUrl,
        baseUrl: documentUrl,
        documentUrl,
        allowedOrigins: new Set(policy.origins),
        createLoader,
        resolveHandle: loadAssetUrl,
        signal: controller.signal,
      }).then(
        (gltf) => {
          unsubscribe()
          try {
            onLoad(gltf as unknown as GLTF)
          } finally {
            end()
          }
        },
        (error) => {
          unsubscribe()
          if (
            error instanceof AssetAccessError ||
            (controller.signal.aborted && getClientAssetPolicy().version !== request.version)
          )
            unavailable()
          else fail(error)
        },
      )
    } catch (error) {
      if (ended) throw error
      if (error instanceof AssetAccessError) unavailable()
      else fail(error)
    }
  }
}
