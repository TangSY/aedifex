import { expect, mock, test } from 'bun:test'
import { BoxGeometry, Mesh, MeshStandardMaterial, Scene } from 'three'
import { USDZExporter } from 'three/addons/exporters/USDZExporter.js'
import { strFromU8, strToU8, unzipSync, zipSync } from 'three/addons/libs/fflate.module.js'
import { loadGuardedUsd } from './guarded-usd'

async function model(
  textureUrl?: string,
  options?: { embedded?: boolean; nested?: boolean },
): Promise<Uint8Array> {
  const scene = new Scene()
  scene.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()))
  const archive = unzipSync(new Uint8Array(await new USDZExporter().parseAsync(scene)))
  if (textureUrl) {
    const root = strFromU8(archive['model.usda']!)
    const id = root.match(/def Material "([^"]+)"/)?.[1]
    if (!id) throw new Error('Missing exported material')
    const modified = root
      .replace(
        'color3f inputs:diffuseColor = (1, 1, 1)',
        `color3f inputs:diffuseColor.connect = </Materials/${id}/Texture.outputs:rgb>`,
      )
      .replace(
        'def Shader "PreviewSurface"',
        `def Shader "Texture"\n\t\t{\n\t\t\tuniform token info:id = "UsdUVTexture"\n\t\t\tasset inputs:file = @${textureUrl}@\n\t\t\tfloat3 outputs:rgb\n\t\t}\n\n\t\tdef Shader "PreviewSurface"`,
      )
    if (options?.nested) {
      const materialStart = modified.indexOf('\ndef "Materials"')
      const geometryName = Object.keys(archive).find(
        (name) => name.startsWith('geometries/') && name.endsWith('.usda'),
      )
      if (materialStart < 0 || !geometryName) throw new Error('Missing nested geometry fixture')
      const geometry = strFromU8(archive[geometryName]!).replace(
        'def Mesh "Geometry"\n\t{',
        `def Mesh "Geometry"\n\t{\n\t\trel material:binding = </Materials/${id}>`,
      )
      archive['model.usda'] = strToU8(modified.slice(0, materialStart))
      archive[geometryName] = strToU8(geometry + modified.slice(materialStart))
    } else archive['model.usda'] = strToU8(modified)
    if (options?.embedded) archive[textureUrl] = new Uint8Array([1, 2, 3])
  }
  return zipSync(archive)
}

test('USDZ loads nested geometry and refuses an unlisted external texture', async () => {
  const bytes = await model('https://blocked.example/image.png')
  const calls: string[] = []
  const previous = globalThis.fetch
  globalThis.fetch = mock(async (input: RequestInfo | URL) => {
    calls.push(String(input))
    return new Response(bytes)
  }) as typeof fetch
  try {
    await expect(
      loadGuardedUsd({
        sourceUrl: 'https://allowed.example/model.usdz',
        resolvedUrl: 'https://allowed.example/model.usdz',
        documentUrl: 'https://app.example/editor',
        origins: ['https://allowed.example'],
        signal: new AbortController().signal,
        decodeImage: async () => ({}),
      }),
    ).rejects.toThrow()
    expect(calls).toEqual(['https://allowed.example/model.usdz'])
  } finally {
    globalThis.fetch = previous
  }
})

test('USDZ decodes embedded images without external requests and disposes its geometry', async () => {
  const bytes = await model('textures/local.png', { embedded: true })
  const previous = globalThis.fetch
  const fetcher = mock(async () => new Response(bytes))
  globalThis.fetch = fetcher as typeof fetch
  const decode = mock(async (url: string) => {
    expect(url.startsWith('blob:')).toBe(true)
    return {}
  })
  try {
    const result = await loadGuardedUsd({
      sourceUrl: '/model.usdz',
      resolvedUrl: 'https://app.example/model.usdz',
      documentUrl: 'https://app.example/editor',
      origins: [],
      signal: new AbortController().signal,
      decodeImage: decode,
    })
    let mesh: Mesh | undefined
    result.scene.traverse((object) => {
      if ((object as Mesh).isMesh) mesh = object as Mesh
    })
    expect(mesh).toBeDefined()
    expect((mesh!.material as MeshStandardMaterial).map).toBeTruthy()
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(decode).toHaveBeenCalledTimes(1)
    let disposed = 0
    mesh!.geometry.addEventListener('dispose', () => {
      disposed++
    })
    result.dispose()
    result.dispose()
    expect(disposed).toBe(1)
  } finally {
    globalThis.fetch = previous
  }
})

test('nested USD layers cannot bypass texture origin checks', async () => {
  const bytes = await model('https://blocked.example/nested.png', { nested: true })
  const fetcher = mock(async () => new Response(bytes))
  const previous = globalThis.fetch
  globalThis.fetch = fetcher as typeof fetch
  try {
    await expect(
      loadGuardedUsd({
        sourceUrl: 'https://allowed.example/model.usdz',
        resolvedUrl: 'https://allowed.example/model.usdz',
        documentUrl: 'https://app.example/editor',
        origins: ['https://allowed.example'],
        signal: new AbortController().signal,
        decodeImage: async () => ({}),
      }),
    ).rejects.toThrow()
    expect(fetcher).toHaveBeenCalledTimes(1)
  } finally {
    globalThis.fetch = previous
  }
})

test('USDZ reads an allowed external texture without following redirects', async () => {
  const bytes = await model('https://allowed.example/texture.png')
  const previous = globalThis.fetch
  const calls: Array<{ url: string; redirect?: RequestRedirect }> = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), redirect: init?.redirect })
    return String(input).endsWith('/model.usdz')
      ? new Response(bytes)
      : new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } })
  }) as typeof fetch
  const decode = mock(async () => ({}))
  try {
    const result = await loadGuardedUsd({
      sourceUrl: 'https://allowed.example/model.usdz',
      resolvedUrl: 'https://allowed.example/model.usdz',
      documentUrl: 'https://app.example/editor',
      origins: ['https://allowed.example'],
      signal: new AbortController().signal,
      decodeImage: decode,
    })
    expect(calls).toEqual([
      { url: 'https://allowed.example/model.usdz', redirect: 'error' },
      { url: 'https://allowed.example/texture.png', redirect: 'error' },
    ])
    expect(decode).toHaveBeenCalledTimes(1)
    result.dispose()
  } finally {
    globalThis.fetch = previous
  }
})

test('USDZ rejects a declared oversized archive entry before decompression', async () => {
  const bytes = await model()
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let central = -1
  for (let i = 0; i <= bytes.length - 28; i++) {
    if (view.getUint32(i, true) === 0x02014b50) {
      central = i
      break
    }
  }
  expect(central).toBeGreaterThanOrEqual(0)
  view.setUint32(central + 24, 256 * 1024 * 1024 + 1, true)
  const previous = globalThis.fetch
  globalThis.fetch = (async () => new Response(bytes)) as typeof fetch
  try {
    await expect(
      loadGuardedUsd({
        sourceUrl: '/model.usdz',
        resolvedUrl: 'https://app.example/model.usdz',
        documentUrl: 'https://app.example/editor',
        origins: [],
        signal: new AbortController().signal,
        decodeImage: async () => ({}),
      }),
    ).rejects.toThrow('budget')
  } finally {
    globalThis.fetch = previous
  }
})

test('USDZ cancellation stops waiting for a stalled external texture', async () => {
  const bytes = await model('https://allowed.example/stalled.png')
  const previous = globalThis.fetch
  const controller = new AbortController()
  let requested = false
  let requestSignal: AbortSignal | null | undefined
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith('/model.usdz')) return Promise.resolve(new Response(bytes))
    requested = true
    requestSignal = init?.signal
    return new Promise(() => {})
  }) as typeof fetch
  try {
    const pending = loadGuardedUsd({
      sourceUrl: 'https://allowed.example/model.usdz',
      resolvedUrl: 'https://allowed.example/model.usdz',
      documentUrl: 'https://app.example/editor',
      origins: ['https://allowed.example'],
      signal: controller.signal,
      decodeImage: async () => ({}),
    }).then(
      () => null,
      (error: Error) => error,
    )
    while (!requested) await new Promise((resolve) => setTimeout(resolve, 0))
    controller.abort()
    expect(requestSignal?.aborted).toBe(true)
    expect((await pending)?.name).toBe('AbortError')
  } finally {
    controller.abort()
    globalThis.fetch = previous
  }
})

test('USDZ texture read never reaches a redirect target', async () => {
  const bytes = await model('/texture.png')
  let destinationHits = 0
  const destination = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch() {
      destinationHits++
      return new Response('unexpected')
    },
  })
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      if (new URL(request.url).pathname === '/model.usdz') return new Response(bytes)
      return Response.redirect(`http://127.0.0.1:${destination.port}/texture.png`)
    },
  })
  try {
    const documentUrl = `http://127.0.0.1:${server.port}/editor`
    await expect(
      loadGuardedUsd({
        sourceUrl: '/model.usdz',
        resolvedUrl: `http://127.0.0.1:${server.port}/model.usdz`,
        documentUrl,
        origins: [],
        signal: new AbortController().signal,
        decodeImage: async () => ({}),
      }),
    ).rejects.toThrow()
    expect(destinationHits).toBe(0)
  } finally {
    server.stop(true)
    destination.stop(true)
  }
})

test('USDZ keeps geometry visible when an embedded image cannot be decoded', async () => {
  const bytes = await model('textures/local.png', { embedded: true })
  const previous = globalThis.fetch
  globalThis.fetch = (async () => new Response(bytes)) as typeof fetch
  try {
    const result = await loadGuardedUsd({
      sourceUrl: '/model.usdz',
      resolvedUrl: 'https://app.example/model.usdz',
      documentUrl: 'https://app.example/editor',
      origins: [],
      signal: new AbortController().signal,
      decodeImage: async () => {
        throw new Error('decode failed')
      },
    })
    let mesh: Mesh | undefined
    result.scene.traverse((object) => {
      if ((object as Mesh).isMesh) mesh = object as Mesh
    })
    expect(mesh).toBeDefined()
    result.dispose()
  } finally {
    globalThis.fetch = previous
  }
})
