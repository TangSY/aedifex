import { getClientAssetPolicy, subscribeClientAssetPolicy } from '@aedifex/core'
import type { useGLTF } from '@react-three/drei'
import { useLoader, useThree } from '@react-three/fiber'
import { useEffect, useSyncExternalStore } from 'react'
import { DRACOLoader, type GLTF, GLTFLoader, MeshoptDecoder } from 'three-stdlib'
import { preserveGltfUnlit } from '../lib/gltf-unlit'
import {
  GuardedViewerGLTFLoader,
  guardedViewerModelKey,
  isGuardedGltfUnavailable,
} from '../lib/guarded-viewer-loader'
import { configureKtx2Support } from '../lib/ktx2-loader'
import { retainResourceFailure } from '../lib/resource-failures'

let dracoLoader: DRACOLoader | null = null

const useGLTFKTX2 = (
  path: string,
  source: string | { sourceUrl?: string; validateResolved: true } = path,
): ReturnType<typeof useGLTF> => {
  const gl = useThree((state) => state.gl)
  const policy = useSyncExternalStore(
    subscribeClientAssetPolicy,
    getClientAssetPolicy,
    getClientAssetPolicy,
  )
  const guarded = policy.origins !== null
  const sourceUrl = typeof source === 'string' ? source : (source.sourceUrl ?? '')
  const key = guarded
    ? guardedViewerModelKey({
        source: sourceUrl,
        resolvedUrl: path,
        version: policy.version,
        validateResolved: typeof source !== 'string',
      })
    : path
  const gltf = useLoader(guarded ? GuardedViewerGLTFLoader : GLTFLoader, key, (loader) => {
    loader.register(preserveGltfUnlit)
    configureKtx2Support(loader, gl)
    if (!dracoLoader) {
      dracoLoader = new DRACOLoader()
      dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.5/')
    }
    loader.setDRACOLoader(dracoLoader)
    loader.setMeshoptDecoder(
      typeof MeshoptDecoder === 'function' ? MeshoptDecoder() : MeshoptDecoder,
    )
  }) as ReturnType<typeof useGLTF>
  const unavailable = guarded && isGuardedGltfUnavailable(gltf as GLTF)
  useEffect(
    () => (unavailable ? retainResourceFailure(`model:${sourceUrl || path}`) : undefined),
    [path, sourceUrl, unavailable],
  )
  return gltf
}

export { useGLTFKTX2 }
