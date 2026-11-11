'use client'

import { AssetAccessError, getClientAssetPolicy, subscribeClientAssetPolicy } from '@aedifex/core'
import { useLoader } from '@react-three/fiber'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { DoubleSide, FrontSide, type Material, type Mesh, type Object3D } from 'three'
import { USDLoader } from 'three/addons/loaders/USDLoader.js'
import { useGLTFKTX2 } from '../../hooks/use-gltf-ktx2'
import { retainResourceFailure } from '../../lib/resource-failures'
import { rewriteLoopbackAssetUrl } from '../asset-url'
import { loadGuardedUsd } from '../guarded-usd'
import type { CaptureModelFormat } from '../stream-rendering'

export function CaptureRoomModel({
  dollhouse,
  format,
  mediaType,
  opacity = 100,
  sourceUrl,
  url,
}: {
  dollhouse?: boolean
  format?: CaptureModelFormat
  mediaType: string
  opacity?: number
  sourceUrl?: string
  url: string
}) {
  if (
    format === 'usdz' ||
    mediaType === 'model/vnd.usdz+zip' ||
    url.toLowerCase().endsWith('.usdz')
  ) {
    return <UsdzRoomModel dollhouse={dollhouse} opacity={opacity} sourceUrl={sourceUrl} url={url} />
  }
  return <GlbRoomModel dollhouse={dollhouse} opacity={opacity} sourceUrl={sourceUrl} url={url} />
}

function UsdzRoomModel({
  dollhouse,
  opacity,
  sourceUrl,
  url,
}: {
  dollhouse?: boolean
  opacity: number
  sourceUrl?: string
  url: string
}) {
  const policy = useSyncExternalStore(
    subscribeClientAssetPolicy,
    getClientAssetPolicy,
    getClientAssetPolicy,
  )
  if (policy.origins !== null)
    return (
      <GuardedUsdzRoomModel
        dollhouse={dollhouse}
        opacity={opacity}
        sourceUrl={sourceUrl}
        url={url}
      />
    )
  return <UnrestrictedUsdzRoomModel dollhouse={dollhouse} opacity={opacity} url={url} />
}

function UnrestrictedUsdzRoomModel({
  dollhouse,
  opacity,
  url,
}: {
  dollhouse?: boolean
  opacity: number
  url: string
}) {
  const source = useLoader(USDLoader, rewriteLoopbackAssetUrl(url))
  return <UsdModel source={source} dollhouse={dollhouse} opacity={opacity} />
}

function GuardedUsdzRoomModel({
  dollhouse,
  opacity,
  sourceUrl,
  url,
}: {
  dollhouse?: boolean
  opacity: number
  sourceUrl?: string
  url: string
}) {
  const policy = useSyncExternalStore(
    subscribeClientAssetPolicy,
    getClientAssetPolicy,
    getClientAssetPolicy,
  )
  const resolvedUrl = rewriteLoopbackAssetUrl(url)
  const key = `${policy.version}:${sourceUrl ?? ''}:${resolvedUrl}`
  const [result, setResult] = useState<{
    key: string
    scene?: Object3D
    error?: Error
    unavailable?: boolean
  } | null>(null)
  useEffect(() => {
    if (policy.origins === null) return
    const controller = new AbortController()
    const unsubscribe = subscribeClientAssetPolicy(() => controller.abort())
    if (getClientAssetPolicy().version !== policy.version) controller.abort()
    let dispose: (() => void) | undefined
    void loadGuardedUsd({
      sourceUrl,
      resolvedUrl,
      documentUrl: window.location.href,
      origins: policy.origins,
      signal: controller.signal,
    })
      .then((loaded) => {
        if (controller.signal.aborted) {
          loaded.dispose()
          return
        }
        dispose = loaded.dispose
        setResult({ key, scene: loaded.scene })
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setResult({
            key,
            error: cause instanceof Error ? cause : new Error('Could not load USD model.'),
            unavailable: cause instanceof AssetAccessError,
          })
      })
    return () => {
      controller.abort()
      unsubscribe()
      dispose?.()
    }
  }, [key, policy, resolvedUrl, sourceUrl])
  useEffect(() => {
    if (result?.key !== key || !result.unavailable) return
    return retainResourceFailure(`model:${sourceUrl ?? resolvedUrl}`)
  }, [key, resolvedUrl, result, sourceUrl])
  if (!result || result.key !== key || result.unavailable) return null
  if (result.error) throw result.error
  return result.scene ? (
    <UsdModel source={result.scene} dollhouse={dollhouse} opacity={opacity} />
  ) : null
}

function UsdModel({
  source,
  dollhouse,
  opacity,
}: {
  source: Object3D
  dollhouse?: boolean
  opacity: number
}) {
  const model = useClonedModel(source, opacity, dollhouse)
  return <primitive object={model} />
}

function GlbRoomModel({
  dollhouse,
  opacity,
  sourceUrl,
  url,
}: {
  dollhouse?: boolean
  opacity: number
  sourceUrl?: string
  url: string
}) {
  const gltf = useGLTFKTX2(rewriteLoopbackAssetUrl(url), { sourceUrl, validateResolved: true }) as {
    scene: Object3D
  }
  const model = useClonedModel(gltf.scene, opacity, dollhouse)
  return <primitive object={model} />
}

function useClonedModel(source: Object3D, opacity: number, dollhouse?: boolean): Object3D {
  const model = useMemo(() => {
    const clone = source.clone(true)
    clone.traverse((child) => {
      const mesh = child as Mesh
      if (!mesh.isMesh) return
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((material) => material.clone())
        : mesh.material.clone()
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (dollhouse !== undefined) material.side = dollhouse ? FrontSide : DoubleSide
      }
    })
    return clone
  }, [source, dollhouse])

  useEffect(() => {
    const normalizedOpacity = opacity / 100
    const transparent = normalizedOpacity < 1
    model.traverse((child) => {
      const mesh = child as Mesh
      if (!mesh.isMesh) return
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const material of materials) {
        material.transparent = transparent
        material.opacity = normalizedOpacity
        material.depthWrite = !transparent
        material.needsUpdate = true
      }
    })
  }, [model, opacity])

  useEffect(
    () => () => {
      model.traverse((child) => {
        const mesh = child as Mesh
        if (!mesh.isMesh) return
        const materials: Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const material of materials) material.dispose()
      })
    },
    [model],
  )

  return model
}
