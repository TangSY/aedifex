import { expect, spyOn, test } from 'bun:test'
import { configureClientAssetPolicy } from '@aedifex/core'
import { type MeshStandardMaterial, Texture } from 'three'
import { ensureKtx2Support, ktx2Loader } from '../lib/ktx2-loader'
import { createMaterial } from '../lib/materials'
import { installBrowserFixture } from './browser-fixture'

test('restricted KTX2 materials use the KTX2 loader on checked bytes', async () => {
  const restoreBrowser = installBrowserFixture()
  const detect = spyOn(ktx2Loader, 'detectSupport').mockReturnValue(ktx2Loader)
  const decoder = spyOn(ktx2Loader, 'loadAsync').mockResolvedValue(new Texture() as never)
  const fetcher = spyOn(globalThis, 'fetch').mockImplementation(
    async () => new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/ktx2' } }),
  )
  configureClientAssetPolicy(['https://allowed.example'])
  try {
    expect(ensureKtx2Support({})).toBe(true)
    const material = createMaterial({
      texture: { url: 'https://allowed.example/policy-texture.ktx2' },
    }) as MeshStandardMaterial
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(material.map).not.toBeNull()
    expect(decoder.mock.calls[0]?.[0].startsWith('blob:')).toBe(true)
    expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe('error')
  } finally {
    configureClientAssetPolicy(null)
    decoder.mockRestore()
    detect.mockRestore()
    fetcher.mockRestore()
    restoreBrowser()
  }
})

test('unrestricted custom KTX2 materials wait for the asynchronous loader', async () => {
  configureClientAssetPolicy(null)
  const detect = spyOn(ktx2Loader, 'detectSupport').mockReturnValue(ktx2Loader)
  const sync = spyOn(ktx2Loader, 'load').mockImplementation(() => undefined)
  const decoder = spyOn(ktx2Loader, 'loadAsync').mockResolvedValue(new Texture() as never)
  try {
    expect(ensureKtx2Support({})).toBe(true)
    const material = createMaterial({
      texture: { url: 'https://example.org/custom-unrestricted.ktx2', repeat: [2, 3] },
    }) as MeshStandardMaterial
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(decoder).toHaveBeenCalledTimes(1)
    expect(material.map?.repeat.toArray()).toEqual([2, 3])
    expect(sync).not.toHaveBeenCalled()
  } finally {
    decoder.mockRestore()
    sync.mockRestore()
    detect.mockRestore()
  }
})

test('a late unrestricted KTX2 result is disposed after a policy change', async () => {
  configureClientAssetPolicy(null)
  let finish!: (texture: Texture) => void
  const decoder = spyOn(ktx2Loader, 'loadAsync').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve as (texture: Texture) => void
      }),
  )
  try {
    const material = createMaterial({
      texture: { url: 'https://example.org/late-unrestricted.ktx2' },
    }) as MeshStandardMaterial
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(decoder).toHaveBeenCalledTimes(1)
    configureClientAssetPolicy([])
    const texture = new Texture()
    let disposed = 0
    texture.addEventListener('dispose', () => {
      disposed++
    })
    finish(texture)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(disposed).toBe(1)
    expect(material.map).toBeNull()
  } finally {
    configureClientAssetPolicy(null)
    decoder.mockRestore()
  }
})
