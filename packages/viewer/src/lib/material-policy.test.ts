import { expect, spyOn, test } from 'bun:test'
import { configureClientAssetPolicy, MaterialPresetPayloadSchema } from '@aedifex/core'
import { MeshStandardMaterial, Texture, TextureLoader } from 'three'
import { installBrowserFixture } from '../__tests__/browser-fixture'
import {
  applyMaterialPresetToMaterials,
  createMaterial,
  materialTextureLoadState,
} from './materials'
import { getResourceFailureCount } from './resource-failures'

test('material textures do not bypass the configured origin policy', async () => {
  const restoreBrowser = installBrowserFixture()
  const syncLoad = spyOn(TextureLoader.prototype, 'load').mockReturnValue(new Texture())
  const asyncLoad = spyOn(TextureLoader.prototype, 'loadAsync').mockResolvedValue(new Texture())
  const fetcher = spyOn(globalThis, 'fetch').mockImplementation(async () => new Response())
  configureClientAssetPolicy(['https://allowed.example'])
  try {
    createMaterial({ texture: { url: 'https://blocked.example/material-direct.png' } })
    const material = new MeshStandardMaterial()
    applyMaterialPresetToMaterials(
      material,
      MaterialPresetPayloadSchema.parse({
        maps: { albedoMap: 'https://blocked.example/material-preset.png' },
        mapProperties: {},
      }),
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(syncLoad).not.toHaveBeenCalled()
    expect(asyncLoad).not.toHaveBeenCalled()
    expect(fetcher).not.toHaveBeenCalled()
    expect(material.map).toBeNull()
    expect(getResourceFailureCount()).toBe(2)
    material.dispose()
  } finally {
    configureClientAssetPolicy(null)
    syncLoad.mockRestore()
    asyncLoad.mockRestore()
    fetcher.mockRestore()
    restoreBrowser()
  }
})

test('unrestricted materials retain synchronous texture loading', () => {
  configureClientAssetPolicy(null)
  const texture = new Texture()
  const loader = spyOn(TextureLoader.prototype, 'load').mockReturnValue(texture)
  try {
    const material = createMaterial({
      texture: { url: 'https://example.com/unrestricted-policy-test.png', repeat: [2, 3] },
    }) as MeshStandardMaterial
    expect(material.map).toBe(texture)
    expect(texture.repeat.toArray()).toEqual([2, 3])
    expect(loader).toHaveBeenCalledTimes(1)
  } finally {
    loader.mockRestore()
  }
})

test('a stale unrestricted loader callback cannot mark the new policy as failed', () => {
  configureClientAssetPolicy(null)
  let onError: (() => void) | undefined
  const loader = spyOn(TextureLoader.prototype, 'load').mockImplementation(
    (_url, _onLoad, _onProgress, onLoadError) => {
      onError = () => onLoadError?.({} as ErrorEvent)
      return new Texture()
    },
  )
  try {
    createMaterial({ texture: { url: 'https://example.com/old-callback.png' } })
    configureClientAssetPolicy([])
    onError?.()
    expect(materialTextureLoadState()).toEqual({ pending: 0, failed: 0 })
  } finally {
    configureClientAssetPolicy(null)
    loader.mockRestore()
  }
})

test('allowed textures use guarded reads and are removed when policy changes', async () => {
  const restoreBrowser = installBrowserFixture()
  const decoded: string[] = []
  const loader = spyOn(TextureLoader.prototype, 'loadAsync').mockImplementation(async (url) => {
    decoded.push(url)
    return new Texture()
  })
  const fetcher = spyOn(globalThis, 'fetch').mockImplementation(
    async () => new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } }),
  )
  configureClientAssetPolicy(['https://allowed.example'])
  try {
    const direct = createMaterial({
      texture: { url: 'https://allowed.example/direct-policy-test.png' },
    }) as MeshStandardMaterial
    const preset = new MeshStandardMaterial()
    applyMaterialPresetToMaterials(
      preset,
      MaterialPresetPayloadSchema.parse({
        maps: { albedoMap: 'https://allowed.example/preset-policy-test.png' },
        mapProperties: {},
      }),
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(direct.map).not.toBeNull()
    expect(preset.map).not.toBeNull()
    expect(decoded).toHaveLength(2)
    expect(decoded.every((url) => url.startsWith('blob:'))).toBe(true)
    expect(fetcher.mock.calls.every((call) => call[1]?.redirect === 'error')).toBe(true)
    configureClientAssetPolicy([])
    expect(direct.map).toBeNull()
    expect(preset.map).toBeNull()
    preset.dispose()
  } finally {
    configureClientAssetPolicy(null)
    loader.mockRestore()
    fetcher.mockRestore()
    restoreBrowser()
  }
})

test('a policy change aborts a pending texture and prevents stale assignment', async () => {
  const restoreBrowser = installBrowserFixture()
  let requestSignal: AbortSignal | null | undefined
  let finish!: (response: Response) => void
  const fetcher = spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
    requestSignal = init?.signal
    return new Promise((resolve) => {
      finish = resolve
    })
  })
  const loader = spyOn(TextureLoader.prototype, 'loadAsync').mockResolvedValue(new Texture())
  configureClientAssetPolicy(['https://allowed.example'])
  try {
    const material = createMaterial({
      texture: { url: 'https://allowed.example/pending-policy-test.png' },
    }) as MeshStandardMaterial
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(requestSignal?.aborted).toBe(false)
    configureClientAssetPolicy([])
    expect(requestSignal?.aborted).toBe(true)
    finish(new Response(new Uint8Array([1])))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(material.map).toBeNull()
    expect(loader).not.toHaveBeenCalled()
  } finally {
    configureClientAssetPolicy(null)
    loader.mockRestore()
    fetcher.mockRestore()
    restoreBrowser()
  }
})

test('restricted KTX2 decoding is isolated from other renderer tests', () => {
  const result = Bun.spawnSync({
    cmd: [process.execPath, 'test', `${import.meta.dir}/../__tests__/material-ktx2.fixture.ts`],
    stdout: 'pipe',
    stderr: 'pipe',
  })
  expect(`${result.stdout.toString()}\n${result.stderr.toString()}`).toContain('3 pass')
  expect(result.exitCode).toBe(0)
}, 30000)

test('deferred unrestricted KTX2 loading is cancelled on policy changes', () => {
  const result = Bun.spawnSync({
    cmd: [
      process.execPath,
      'test',
      `${import.meta.dir}/../__tests__/material-ktx2-cancel.fixture.ts`,
    ],
    stdout: 'pipe',
    stderr: 'pipe',
  })
  expect(`${result.stdout.toString()}\n${result.stderr.toString()}`).toContain('1 pass')
  expect(result.exitCode).toBe(0)
}, 30000)
