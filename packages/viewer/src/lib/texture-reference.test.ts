// @ts-expect-error — bun:test is provided by the Bun runtime; viewer does not
// depend on @types/bun so the import type is unresolved at compile time.
import { describe, expect, test } from 'bun:test'
import * as THREE from 'three'
import { ASSETS_CDN_URL } from './asset-url'
import { getAedifexTextureRef, stampAedifexTextureRef } from './texture-reference'

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://test-storage.supabase.co'
const STORAGE_ORIGIN = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin

describe('Aedifex texture references', () => {
  test('uses the current storage origin after missing, invalid, and changed configuration', () => {
    const original = process.env.NEXT_PUBLIC_SUPABASE_URL
    const texture = new THREE.Texture()
    const input = {
      kind: 'project-asset' as const,
      src: 'https://second-storage.example/storage/v1/object/public/project-assets/p/a.png',
      slot: 'map',
    }
    try {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL
      expect(stampAedifexTextureRef(texture, input)).toBeNull()
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'not a URL'
      expect(stampAedifexTextureRef(texture, input)).toBeNull()
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://second-storage.example'
      expect(stampAedifexTextureRef(texture, input)?.kind).toBe('project-asset')
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://other-storage.example'
      expect(getAedifexTextureRef(texture)).toBeNull()
    } finally {
      if (original === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
      else process.env.NEXT_PUBLIC_SUPABASE_URL = original
    }
  })
  test("resolves 'material' input to library-material for storage-bucket URLs", () => {
    const texture = new THREE.Texture()
    texture.colorSpace = THREE.SRGBColorSpace
    const src = `${STORAGE_ORIGIN}/storage/v1/object/public/materials/user/mtl_1/oak_basecolor_512.ktx2`

    const ref = stampAedifexTextureRef(texture, { kind: 'material', src, slot: 'map' })

    expect(ref).toEqual({
      v: 1,
      kind: 'library-material',
      src,
      map: 'basecolor',
      colorSpace: 'srgb',
    })
    expect(getAedifexTextureRef(texture)).toEqual(ref)
  })

  test("resolves 'material' input to app-material for assets-CDN catalog URLs", () => {
    const cdnOrigin = new URL(ASSETS_CDN_URL).origin
    const texture = new THREE.Texture()
    const src = `${cdnOrigin}/material/concrete/prepared_drywall/prepared_drywall_normal_512.ktx2`

    const ref = stampAedifexTextureRef(texture, { kind: 'material', src, slot: 'normalMap' })

    expect(ref).toEqual({ v: 1, kind: 'app-material', src, map: 'normal', colorSpace: 'linear' })
    expect(getAedifexTextureRef(texture)).toEqual(ref)

    const foreign = new THREE.Texture()
    expect(
      stampAedifexTextureRef(foreign, {
        kind: 'material',
        src: 'https://example.com/material/concrete/x/x_basecolor_512.ktx2',
        slot: 'map',
      }),
    ).toBeNull()
  })

  test('stamps the exact project-asset payload for Aedifex storage URLs', () => {
    const texture = new THREE.Texture()
    texture.colorSpace = THREE.SRGBColorSpace

    const ref = stampAedifexTextureRef(texture, {
      kind: 'project-asset',
      src: `${STORAGE_ORIGIN}/storage/v1/object/public/project-assets/project/asset.png`,
      slot: 'map',
    })

    expect(ref).toEqual({
      v: 1,
      kind: 'project-asset',
      src: `${STORAGE_ORIGIN}/storage/v1/object/public/project-assets/project/asset.png`,
      map: 'basecolor',
      colorSpace: 'srgb',
    })
    expect(getAedifexTextureRef(texture)).toEqual(ref)
  })

  test('keeps local and non-Aedifex URLs unstamped', () => {
    for (const src of [
      'asset://project/asset',
      'blob:https://editor.aedifex.app/asset',
      'data:image/png;base64,AAAA',
      'https://example.com/storage/v1/object/public/project-assets/project/asset.png',
    ]) {
      const texture = new THREE.Texture()
      expect(
        stampAedifexTextureRef(texture, { kind: 'project-asset', src, slot: 'map' }),
      ).toBeNull()
      expect(texture.userData.aedifexTextureRef).toBeUndefined()
    }
  })

  test('includes imageIndex only for item GLB references', () => {
    const texture = new THREE.Texture()
    const ref = stampAedifexTextureRef(texture, {
      kind: 'item-glb',
      src: `${STORAGE_ORIGIN}/storage/v1/object/public/items/system/chair/model.glb`,
      slot: 'normalMap',
      imageIndex: 2,
    })

    expect(ref).toEqual({
      v: 1,
      kind: 'item-glb',
      src: `${STORAGE_ORIGIN}/storage/v1/object/public/items/system/chair/model.glb`,
      imageIndex: 2,
      map: 'normal',
      colorSpace: 'linear',
    })
  })
})
