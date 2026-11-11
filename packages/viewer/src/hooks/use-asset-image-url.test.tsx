import { expect, spyOn, test } from 'bun:test'
import { configureClientAssetPolicy } from '@aedifex/core'
import { create } from '@react-three/test-renderer'
import { act } from 'react'
import { installBrowserFixture } from '../__tests__/browser-fixture'
import { resolveCdnUrl } from '../lib/asset-url'
import { useAssetImageUrl } from './use-asset-image-url'

function Preview({ url, catalog = false }: { url: string; catalog?: boolean }) {
  const result = useAssetImageUrl(url, { catalog })
  return <group name={result.status} userData={{ url: result.url }} />
}

test('catalog images retain trusted relative CDN mapping without trusting protocol-relative URLs', async () => {
  const restoreBrowser = installBrowserFixture()
  const fetcher = spyOn(globalThis, 'fetch').mockImplementation(
    async () => new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } }),
  )
  configureClientAssetPolicy([])
  const renderer = await create(<Preview catalog url="/catalog/thumbnail.png" />)
  try {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(fetcher.mock.calls[0]?.[0]).toBe(resolveCdnUrl('/catalog/thumbnail.png'))
    expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe('error')
    expect(
      renderer.scene.findByProps({ name: 'available' }).props.userData.url.startsWith('blob:'),
    ).toBe(true)
    await act(async () => {
      await renderer.update(<Preview catalog url="//blocked.example/image.png" />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(renderer.scene.findAllByProps({ name: 'unavailable' })).toHaveLength(1)
    await act(async () => {
      await renderer.update(<Preview catalog url={resolveCdnUrl('/catalog/thumbnail.png')!} />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(renderer.scene.findAllByProps({ name: 'unavailable' })).toHaveLength(1)
  } finally {
    await renderer.unmount()
    configureClientAssetPolicy(null)
    fetcher.mockRestore()
    restoreBrowser()
  }
})

test('policy changes remove the previous image and prevent disallowed network requests', async () => {
  const restoreBrowser = installBrowserFixture()
  const fetcher = spyOn(globalThis, 'fetch').mockImplementation(
    async () => new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'image/png' } }),
  )
  configureClientAssetPolicy(null)
  const renderer = await create(<Preview url="https://other.example/image.png" />)
  try {
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(renderer.scene.findByProps({ name: 'available' }).props.userData.url).toBe(
      'https://other.example/image.png',
    )
    await act(async () => {
      configureClientAssetPolicy(['https://allowed.example'])
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(renderer.scene.findByProps({ name: 'unavailable' }).props.userData.url).toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(0)
  } finally {
    await renderer.unmount()
    configureClientAssetPolicy(null)
    fetcher.mockRestore()
    restoreBrowser()
  }
})

test('restricted images use a no-redirect read and release their object URL on unmount', async () => {
  const restoreBrowser = installBrowserFixture()
  let redirect: RequestRedirect | undefined
  const fetcher = spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
    redirect = init?.redirect
    return new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'image/png' } })
  })
  const revoke = spyOn(URL, 'revokeObjectURL')
  configureClientAssetPolicy(['https://allowed.example'])
  const renderer = await create(<Preview url="https://allowed.example/image.png" />)
  try {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    const url = renderer.scene.findByProps({ name: 'available' }).props.userData.url as string
    expect(url.startsWith('blob:')).toBe(true)
    expect(redirect).toBe('error')
    await renderer.unmount()
    expect(revoke).toHaveBeenCalledWith(url)
  } finally {
    configureClientAssetPolicy(null)
    fetcher.mockRestore()
    revoke.mockRestore()
    restoreBrowser()
  }
})

test('changing policy aborts an in-flight read before a disallowed image can be displayed', async () => {
  const restoreBrowser = installBrowserFixture()
  let requestSignal: AbortSignal | null | undefined
  let respond!: (response: Response) => void
  const fetcher = spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
    requestSignal = init?.signal
    return new Promise((resolve) => {
      respond = resolve
    })
  })
  configureClientAssetPolicy(['https://allowed.example'])
  const renderer = await create(<Preview url="https://allowed.example/image.png" />)
  try {
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(requestSignal?.aborted).toBe(false)
    await act(async () => {
      configureClientAssetPolicy([])
      respond(new Response(new Uint8Array([1, 2])))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(requestSignal?.aborted).toBe(true)
    expect(renderer.scene.findAllByProps({ name: 'available' })).toHaveLength(0)
    expect(renderer.scene.findAllByProps({ name: 'unavailable' })).toHaveLength(1)
  } finally {
    await renderer.unmount()
    configureClientAssetPolicy(null)
    fetcher.mockRestore()
    restoreBrowser()
  }
})
