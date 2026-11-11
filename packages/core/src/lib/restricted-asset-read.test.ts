import { describe, expect, test } from 'bun:test'
import {
  AssetNetworkError,
  createAssetReadBudget,
  parsePublicAssetOrigins,
  publicAssetOrigins,
  publicAssetOriginsFromBindings,
  readRestrictedAsset,
  restrictedAssetUrl,
} from './restricted-asset-read'

const documentUrl = 'https://app.example/editor'
const allowedOrigins = new Set(['https://cdn.example'])

describe('restricted asset requests', () => {
  test('only exposes normalized HTTPS origins and preserves invalid configured lists as restrictive', () => {
    expect(publicAssetOrigins(undefined)).toBeNull()
    expect(publicAssetOrigins('')).toBeNull()
    expect(publicAssetOrigins('invalid, http://localhost:8080')).toEqual([])
    expect(
      publicAssetOrigins('https://user:secret@CDN.example/path?token=secret,https://cdn.example'),
    ).toEqual(['https://cdn.example'])
  })

  test('rejects non-string runtime bindings rather than treating them as unrestricted', () => {
    expect(publicAssetOriginsFromBindings({})).toBeNull()
    expect(
      publicAssetOriginsFromBindings({ AEDIFEX_ALLOWED_ASSET_ORIGINS: 'https://cdn.example' }),
    ).toEqual(['https://cdn.example'])
    expect(() => publicAssetOriginsFromBindings({ AEDIFEX_ALLOWED_ASSET_ORIGINS: 123 })).toThrow()
  })

  test('rejects malformed public policy instead of silently disabling the restriction', () => {
    expect(parsePublicAssetOrigins(null)).toBeNull()
    expect(parsePublicAssetOrigins(['https://cdn.example'])).toEqual(['https://cdn.example'])
    for (const invalid of [
      undefined,
      'https://cdn.example',
      ['https://cdn.example/path'],
      ['https://user:secret@cdn.example'],
      ['http://localhost'],
      [1],
    ]) {
      expect(() => parsePublicAssetOrigins(invalid)).toThrow()
    }
  })
  test('permits listed HTTPS sources and same-origin relative paths', () => {
    expect(
      restrictedAssetUrl({
        url: 'https://cdn.example/model.glb',
        baseUrl: documentUrl,
        documentUrl,
        allowedOrigins,
      }),
    ).toBe('https://cdn.example/model.glb')
    expect(
      restrictedAssetUrl({ url: '/asset.glb', baseUrl: documentUrl, documentUrl, allowedOrigins }),
    ).toBe('https://app.example/asset.glb')
  })

  test('rejects explicit unlisted sources including obfuscated and scheme-relative URLs', () => {
    for (const url of [
      '',
      '   ',
      'https://app.example/a',
      'ht\ntps://app.example/a',
      '//cdn.example/a',
      '\\\\cdn.example/a',
      'https://cdn.example@evil.example/a',
    ]) {
      expect(() =>
        restrictedAssetUrl({ url, baseUrl: documentUrl, documentUrl, allowedOrigins }),
      ).toThrow()
    }
  })

  test('requires the target of a relative model dependency to be allowed', () => {
    expect(() =>
      restrictedAssetUrl({
        url: 'texture.png',
        baseUrl: 'https://evil.example/model.gltf',
        documentUrl,
        allowedOrigins,
      }),
    ).toThrow()
    expect(
      restrictedAssetUrl({
        url: 'texture.png',
        baseUrl: 'https://cdn.example/model.gltf',
        documentUrl,
        allowedOrigins,
      }),
    ).toBe('https://cdn.example/texture.png')
  })

  test('permits paths resolved against a host-selected catalog origin without trusting explicit URLs', () => {
    const args = {
      baseUrl: 'https://catalog.example/',
      documentUrl,
      allowedOrigins,
      trustedRelativeOrigin: 'https://catalog.example',
    }
    expect(restrictedAssetUrl({ ...args, url: '/chair.glb' })).toBe(
      'https://catalog.example/chair.glb',
    )
    expect(() =>
      restrictedAssetUrl({ ...args, url: 'https://catalog.example/chair.glb' }),
    ).toThrow()
    expect(() => restrictedAssetUrl({ ...args, url: '//evil.example/x' })).toThrow()
  })

  test('refuses insecure network requests except same-origin local development', () => {
    expect(() =>
      restrictedAssetUrl({
        url: 'http://evil.example/a',
        baseUrl: documentUrl,
        documentUrl,
        allowedOrigins,
      }),
    ).toThrow()
    expect(
      restrictedAssetUrl({
        url: '/a',
        baseUrl: 'http://localhost:3000/editor',
        documentUrl: 'http://localhost:3000/editor',
        allowedOrigins,
      }),
    ).toBe('http://localhost:3000/a')
  })

  test('uses no redirects and cancels failed responses', async () => {
    let cancelled = false
    let options: RequestInit | undefined
    const fetcher = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      options = init
      return new Response(
        new ReadableStream({
          cancel() {
            cancelled = true
          },
        }),
        { status: 404 },
      )
    }) as typeof fetch
    await expect(
      readRestrictedAsset({
        url: '/a',
        baseUrl: documentUrl,
        documentUrl,
        allowedOrigins,
        budget: createAssetReadBudget(10),
        fetcher,
      }),
    ).rejects.toThrow()
    expect(options?.redirect).toBe('error')
    expect(cancelled).toBe(true)
  })

  test('preserves a failed HTTP status for the existing retry policy', async () => {
    const fetcher = (async () => new Response(null, { status: 503 })) as typeof fetch
    await expect(
      readRestrictedAsset({
        url: '/a',
        baseUrl: documentUrl,
        documentUrl,
        allowedOrigins,
        budget: createAssetReadBudget(10),
        fetcher,
      }),
    ).rejects.toMatchObject({ response: { status: 503 } })
  })

  test('does not fetch an unlisted URL and propagates unreadable cross-origin responses', async () => {
    let requests = 0
    const fetcher = (async () => {
      requests++
      throw new TypeError('Failed to fetch')
    }) as typeof fetch
    const args = {
      baseUrl: documentUrl,
      documentUrl,
      allowedOrigins,
      budget: createAssetReadBudget(10),
      fetcher,
    }
    await expect(
      readRestrictedAsset({ ...args, url: 'https://other.example/image.png' }),
    ).rejects.toThrow()
    expect(requests).toBe(0)
    await expect(
      readRestrictedAsset({ ...args, url: 'https://cdn.example/image.png' }),
    ).rejects.toBeInstanceOf(AssetNetworkError)
    expect(requests).toBe(1)
  })

  test('counts streamed bytes and cancels over-budget reads', async () => {
    const budget = createAssetReadBudget(6)
    let cancelled = false
    const fetcher = (async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(4))
            controller.enqueue(new Uint8Array(4))
          },
          cancel() {
            cancelled = true
          },
        }),
      )) as typeof fetch
    await expect(
      readRestrictedAsset({
        url: '/a',
        baseUrl: documentUrl,
        documentUrl,
        allowedOrigins,
        budget,
        fetcher,
      }),
    ).rejects.toThrow('budget')
    expect(cancelled).toBe(true)
  })

  test('shares one budget across concurrently read dependencies', async () => {
    const budget = createAssetReadBudget(6)
    const fetcher = (async () => new Response(new Uint8Array([1, 2, 3, 4]))) as typeof fetch
    const args = { url: '/a', baseUrl: documentUrl, documentUrl, allowedOrigins, budget, fetcher }
    const results = await Promise.allSettled([readRestrictedAsset(args), readRestrictedAsset(args)])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect(budget.usedBytes).toBe(4)
  })

  test('does not visit the destination of an actual redirect', async () => {
    let hits = 0
    const destination = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch() {
        hits++
        return new Response('bad')
      },
    })
    const source = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch() {
        return Response.redirect(`http://127.0.0.1:${destination.port}/asset`)
      },
    })
    const localDocumentUrl = `http://127.0.0.1:${source.port}/editor`
    try {
      await expect(
        readRestrictedAsset({
          url: '/asset',
          baseUrl: localDocumentUrl,
          documentUrl: localDocumentUrl,
          allowedOrigins,
          budget: createAssetReadBudget(100),
        }),
      ).rejects.toThrow()
      expect(hits).toBe(0)
    } finally {
      source.stop(true)
      destination.stop(true)
    }
  })

  test('accepts a small resource and shares its consumption with subsequent reads', async () => {
    const budget = createAssetReadBudget(5)
    const fetcher = (async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'content-type': 'image/png' },
      })) as typeof fetch
    const args = { url: '/a', baseUrl: documentUrl, documentUrl, allowedOrigins, budget, fetcher }
    const result = await readRestrictedAsset(args)
    expect([...result.bytes]).toEqual([1, 2, 3])
    expect(result.contentType).toBe('image/png')
    await expect(readRestrictedAsset(args)).rejects.toThrow('budget')
  })

  test('does not start requests after cancellation', async () => {
    const controller = new AbortController()
    controller.abort()
    let requests = 0
    const fetcher = (async () => {
      requests++
      return new Response()
    }) as typeof fetch
    await expect(
      readRestrictedAsset({
        url: '/a',
        baseUrl: documentUrl,
        documentUrl,
        allowedOrigins,
        budget: createAssetReadBudget(10),
        fetcher,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(requests).toBe(0)
  })
})
