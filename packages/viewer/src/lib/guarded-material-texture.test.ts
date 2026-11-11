import { expect, spyOn, test } from 'bun:test'
import { Texture } from 'three'
import { resolveCdnUrl } from './asset-url'
import { loadGuardedMaterialTexture } from './guarded-material-texture'

test('loads permitted textures from guarded bytes and disposes a late decode on cancellation', async () => {
  const fetcher = spyOn(globalThis, 'fetch').mockImplementation(
    async () => new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } }),
  )
  const revoke = spyOn(URL, 'revokeObjectURL')
  const controller = new AbortController()
  let finish!: (texture: Texture) => void
  let decodeUrl = ''
  try {
    const source = 'https://allowed.example/texture.png'
    const loading = loadGuardedMaterialTexture({
      source,
      resolvedUrl: resolveCdnUrl(source)!,
      documentUrl: 'https://app.example/editor',
      origins: ['https://allowed.example'],
      signal: controller.signal,
      loadTexture: (url) => {
        decodeUrl = url
        return new Promise((resolve) => {
          finish = resolve
        })
      },
    })
    while (!decodeUrl) await new Promise((resolve) => setTimeout(resolve, 0))
    expect(decodeUrl.startsWith('blob:')).toBe(true)
    expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe('error')
    controller.abort()
    await expect(loading).rejects.toMatchObject({ name: 'AbortError' })
    expect(revoke).toHaveBeenCalledWith(decodeUrl)
    const texture = new Texture()
    const dispose = spyOn(texture, 'dispose')
    finish(texture)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(dispose).toHaveBeenCalledTimes(1)
  } finally {
    controller.abort()
    revoke.mockRestore()
    fetcher.mockRestore()
  }
})

test('does not request an unlisted material texture', async () => {
  const fetcher = spyOn(globalThis, 'fetch').mockImplementation(async () => new Response())
  try {
    const source = 'https://blocked.example/texture.png'
    await expect(
      loadGuardedMaterialTexture({
        source,
        resolvedUrl: source,
        documentUrl: 'https://app.example/editor',
        origins: ['https://allowed.example'],
        signal: new AbortController().signal,
        loadTexture: async () => new Texture(),
      }),
    ).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  } finally {
    fetcher.mockRestore()
  }
})

test('cancels even if the underlying response never settles', async () => {
  const fetcher = spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
  const controller = new AbortController()
  try {
    const source = 'https://allowed.example/stalled.png'
    const loading = loadGuardedMaterialTexture({
      source,
      resolvedUrl: source,
      documentUrl: 'https://app.example/editor',
      origins: ['https://allowed.example'],
      signal: controller.signal,
      loadTexture: async () => new Texture(),
    })
    controller.abort()
    await expect(loading).rejects.toMatchObject({ name: 'AbortError' })
  } finally {
    controller.abort()
    fetcher.mockRestore()
  }
})
