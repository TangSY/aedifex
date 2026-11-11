/*
 * Portions adapted from three.js USDLoader and USDComposer.
 * Copyright © 2010-2026 three.js authors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
import {
  AssetAccessError,
  createAssetReadBudget,
  readRestrictedAsset,
  restrictedAssetUrl,
} from '@aedifex/core'
import {
  Group,
  ImageLoader,
  type LoadingManager,
  type Object3D,
  Texture,
  type Wrapping,
} from 'three'
import { unzipSync } from 'three/addons/libs/fflate.module.js'
// @ts-expect-error three.js does not publish types for its USD parser internals.
import { USDAParser } from 'three/addons/loaders/usd/USDAParser.js'
// @ts-expect-error three.js does not publish types for its USD composer internals.
import { USDComposer } from 'three/addons/loaders/usd/USDComposer.js'
// @ts-expect-error three.js does not publish types for its USD parser internals.
import { USDCParser } from 'three/addons/loaders/usd/USDCParser.js'
import { disposeObject3DResources } from '../lib/dispose-object3d'
import { guardedResolvedLocation } from '../lib/guarded-resolved-location'

const USD_BYTE_LIMIT = 256 * 1024 * 1024
type ParsedLayer = { specsByPath: Record<string, unknown> }
type UsdAsset = Uint8Array | ParsedLayer | Object3D
type TextureAttrs = Record<string, unknown> | null
type DecodeImage = (url: string) => Promise<unknown>
type ComposerInstance = {
  assets: Record<string, UsdAsset>
  manager: LoadingManager | null
  externalVariantSelections: Record<string, string>
  _resolveFilePath: (path: string) => string
  _getBasePath: (path: string) => string
  _getWrapMode: (value: unknown) => Wrapping
  _applyTextureTransforms: (texture: Texture, attrs: TextureAttrs) => void
  compose: (
    root: ParsedLayer,
    assets: Record<string, UsdAsset>,
    variants: Record<string, string>,
    basePath: string,
  ) => Group
}
const USDComposerBase = USDComposer as new (manager?: LoadingManager | null) => ComposerInstance

export async function loadGuardedUsd({
  sourceUrl,
  resolvedUrl,
  documentUrl,
  origins,
  signal,
  decodeImage = (url) => new ImageLoader().loadAsync(url),
}: {
  sourceUrl?: string
  resolvedUrl: string
  documentUrl: string
  origins: readonly string[]
  signal: AbortSignal
  decodeImage?: DecodeImage
}): Promise<{ scene: Group; dispose: () => void }> {
  const allowedOrigins = new Set(origins)
  const source = guardedResolvedLocation({ sourceUrl, resolvedUrl, documentUrl, origins })
  const baseLocation = { baseUrl: documentUrl, documentUrl, allowedOrigins }
  const rootUrl = restrictedAssetUrl({ ...baseLocation, url: source })
  const modelBase = /^(?:blob|data):/.test(rootUrl) ? documentUrl : new URL('.', rootUrl).href
  const budget = createAssetReadBudget(USD_BYTE_LIMIT)
  const controller = new AbortController()
  const forwardAbort = () => controller.abort()
  signal.addEventListener('abort', forwardAbort, { once: true })
  if (signal.aborted) controller.abort()
  const activeTextures = new Set<Texture>()
  const referenceStack = new Set<string>()
  const detachedRemainders = new Set<Group>()
  const pending = new Set<Promise<void>>()
  const objectUrls = new Set<string>()
  let group: Group | undefined
  let success = false
  let abort!: () => void
  const cancelled = new Promise<never>((_, reject) => {
    abort = () => reject(new DOMException('Aborted', 'AbortError'))
    controller.signal.addEventListener('abort', abort, { once: true })
    if (controller.signal.aborted) abort()
  })
  const read = (url: string, baseUrl: string) =>
    readRestrictedAsset({
      url,
      baseUrl,
      documentUrl,
      allowedOrigins,
      budget,
      signal: controller.signal,
    })
  const disposeTextures = () => {
    for (const texture of activeTextures) texture.dispose()
  }
  const disposeRemainders = () => {
    for (const remainder of detachedRemainders) disposeObject3DResources(remainder)
  }

  class GuardedComposer extends USDComposerBase {
    _loadTexture(
      filePath: string,
      textureAttrs: TextureAttrs,
      transformAttrs: TextureAttrs,
    ): Texture | null {
      let clean = filePath
      if (clean.startsWith('@')) clean = clean.slice(1)
      if (clean.endsWith('@')) clean = clean.slice(0, -1)
      if (!clean) return null
      const resolved: string = this._resolveFilePath(clean)
      let data: UsdAsset | undefined = this.assets[resolved] ?? this.assets[clean]
      if (!data) {
        const basename = clean.split('/').pop() ?? ''
        const match = Object.keys(this.assets as Record<string, UsdAsset>).find((key) =>
          key.endsWith(basename),
        )
        if (match) data = this.assets[match]
      }
      const texture = new Texture()
      activeTextures.add(texture)
      const task = (async () => {
        let blob: Blob
        if (data instanceof Uint8Array) blob = new Blob([data as BlobPart])
        else if (!data) {
          restrictedAssetUrl({ url: clean, baseUrl: modelBase, documentUrl, allowedOrigins })
          let location = resolved
          const normalized = clean.replace(/[\t\r\n]/g, '').trimStart()
          if (!/^[a-z][a-z0-9+.-]*:/i.test(normalized)) {
            const target = new URL(resolved, modelBase)
            if (target.origin === new URL(documentUrl).origin)
              location = `${target.pathname}${target.search}${target.hash}`
          }
          const resource = await read(location, modelBase)
          blob = new Blob([resource.bytes as BlobPart], { type: resource.contentType })
        } else throw new AssetAccessError('USD texture is unavailable')
        if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
        const objectUrl = URL.createObjectURL(blob)
        objectUrls.add(objectUrl)
        try {
          let image: unknown
          try {
            image = await decodeImage(objectUrl)
          } catch {
            if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
            return
          }
          if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
          texture.image = image
          if (textureAttrs) {
            texture.wrapS = this._getWrapMode(textureAttrs['inputs:wrapS'])
            texture.wrapT = this._getWrapMode(textureAttrs['inputs:wrapT'])
          }
          this._applyTextureTransforms(texture, transformAttrs)
          texture.needsUpdate = true
        } finally {
          if (objectUrls.delete(objectUrl)) URL.revokeObjectURL(objectUrl)
        }
      })()
      pending.add(task)
      void task.catch(() => {})
      return texture
    }

    _resolveReference(value: string, localVariants: Record<string, string> = {}): Group | null {
      const match = value?.match(/@([^@]+)@(?:<([^>]+)>)?/)
      if (!match) return null
      const path: string = this._resolveFilePath(match[1]!)
      const asset: UsdAsset | undefined = this.assets[path]
      if (!asset) {
        restrictedAssetUrl({ url: match[1]!, baseUrl: modelBase, documentUrl, allowedOrigins })
        return null
      }
      if ('specsByPath' in asset) {
        if (referenceStack.has(path)) throw new AssetAccessError('Cyclic USD reference')
        referenceStack.add(path)
        try {
          const composer = new GuardedComposer(this.manager)
          const composed: Group = composer.compose(
            asset,
            this.assets,
            { ...localVariants, ...this.externalVariantSelections },
            this._getBasePath(path),
          )
          const name = match[2]?.split('/').pop()
          if (name) {
            const child = composed.children.find((candidate) => candidate.name === name)
            if (child) {
              composed.remove(child)
              detachedRemainders.add(composed)
              const wrapper = new Group()
              wrapper.add(child)
              return wrapper
            }
          }
          return composed
        } finally {
          referenceStack.delete(path)
        }
      }
      if ('isObject3D' in asset && asset.isObject3D) return asset.clone() as Group
      return null
    }
  }

  try {
    const { bytes } = await Promise.race([read(source, documentUrl), cancelled])
    const usda = new USDAParser()
    const usdc = new USDCParser()
    const decoder = new TextDecoder()
    const isCrate = (data: Uint8Array) =>
      data.length >= 8 && decoder.decode(data.subarray(0, 8)) === 'PXR-USDC'
    const parse = (data: Uint8Array): ParsedLayer =>
      isCrate(data)
        ? (usdc.parseData(data.slice().buffer) as ParsedLayer)
        : (usda.parseData(decoder.decode(data)) as ParsedLayer)
    let root: ParsedLayer
    let basePath = modelBase
    const assets: Record<string, UsdAsset> = Object.create(null)
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      let first: string | undefined
      let expanded = 0
      const names = new Set<string>()
      const files = unzipSync(bytes, {
        filter(info) {
          first ??= info.name
          if (names.has(info.name) || info.name === '__proto__')
            throw new AssetAccessError('Invalid USD archive')
          names.add(info.name)
          if (
            !Number.isSafeInteger(info.originalSize) ||
            !Number.isSafeInteger(info.size) ||
            info.originalSize < 0 ||
            info.size < 0
          )
            throw new AssetAccessError('Invalid USD archive')
          expanded += Math.max(info.originalSize, info.size)
          if (expanded > USD_BYTE_LIMIT) throw new AssetAccessError('USD archive budget exceeded')
          return /\.(?:usd|usda|usdc|png|jpe?g|avif)$/i.test(info.name)
        },
      })
      if (!first || !/\.(?:usd|usda|usdc)$/i.test(first) || !files[first])
        throw new AssetAccessError('Invalid USD archive')
      for (const [name, content] of Object.entries(files)) {
        assets[name] = /\.(?:usd|usda|usdc)$/i.test(name) ? parse(content) : content
      }
      root = assets[first] as ParsedLayer
      basePath = first.includes('/') ? first.slice(0, first.lastIndexOf('/')) : ''
    } else root = parse(bytes)
    group = new GuardedComposer().compose(root, assets, {}, basePath) as Group
    await Promise.race([Promise.all([...pending]), cancelled])
    if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
    success = true
    let disposed = false
    return {
      scene: group,
      dispose: () => {
        if (disposed) return
        disposed = true
        disposeObject3DResources(group!)
        disposeRemainders()
        disposeTextures()
      },
    }
  } finally {
    controller.abort()
    controller.signal.removeEventListener('abort', abort)
    signal.removeEventListener('abort', forwardAbort)
    for (const url of objectUrls) URL.revokeObjectURL(url)
    objectUrls.clear()
    if (!success) {
      if (group) disposeObject3DResources(group)
      disposeRemainders()
      disposeTextures()
    }
  }
}
