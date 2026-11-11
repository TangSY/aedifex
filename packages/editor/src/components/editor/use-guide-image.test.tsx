import { expect, spyOn, test } from 'bun:test'
import { configureClientAssetPolicy } from '@aedifex/core'
import { create } from '@react-three/test-renderer'
import { act } from 'react'
import { installBrowserFixture } from '../ui/__tests__/browser-fixture'
import { useGuideImageDimensions, useResolvedAssetUrl } from './use-guide-image'

const images: FakeImage[] = []
class FakeImage {
  src = ''
  naturalWidth = 120
  naturalHeight = 80
  width = 120
  height = 80
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  removed = false
  constructor() {
    images.push(this)
  }
  removeAttribute(name: string) {
    if (name === 'src') this.removed = true
  }
}
function Preview({ source }: { source: string }) {
  const url = useResolvedAssetUrl(source)
  const dimensions = useGuideImageDimensions(url)
  return <group name="preview" userData={{ url, dimensions }} />
}
test('checks guide URLs and clears dimensions when policy changes', async () => {
  const restoreBrowser = installBrowserFixture()
  const originalImage = globalThis.Image
  Object.defineProperty(globalThis, 'Image', { value: FakeImage, configurable: true })
  const fetcher = spyOn(globalThis, 'fetch').mockImplementation(
    async () => new Response(new Uint8Array([1])),
  )
  configureClientAssetPolicy(null)
  const renderer = await create(<Preview source="https://blocked.example/guide.png" />)
  try {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(images[0]?.src).toBe('https://blocked.example/guide.png')
    await act(async () => {
      images[0]?.onload?.()
    })
    expect(renderer.scene.findByProps({ name: 'preview' }).props.userData.dimensions).toEqual({
      width: 120,
      height: 80,
    })
    await act(async () => {
      configureClientAssetPolicy(['https://allowed.example'])
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(images[0]?.removed).toBe(true)
    expect(renderer.scene.findByProps({ name: 'preview' }).props.userData).toEqual({
      url: null,
      dimensions: null,
    })
    expect(fetcher).not.toHaveBeenCalled()
  } finally {
    await renderer.unmount()
    configureClientAssetPolicy(null)
    fetcher.mockRestore()
    Object.defineProperty(globalThis, 'Image', { value: originalImage, configurable: true })
    restoreBrowser()
  }
})

test('allowed guides are read without redirects and release image URLs', async () => {
  images.length = 0
  const restoreBrowser = installBrowserFixture()
  const originalImage = globalThis.Image
  Object.defineProperty(globalThis, 'Image', { value: FakeImage, configurable: true })
  const fetcher = spyOn(globalThis, 'fetch').mockImplementation(
    async () => new Response(new Uint8Array([1])),
  )
  const revoke = spyOn(URL, 'revokeObjectURL')
  configureClientAssetPolicy(['https://allowed.example'])
  const renderer = await create(<Preview source="https://allowed.example/guide.png" />)
  try {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe('error')
    const image = images[0]!
    expect(image.src.startsWith('blob:')).toBe(true)
    await act(async () => {
      image.onload?.()
    })
    expect(renderer.scene.findByProps({ name: 'preview' }).props.userData.dimensions).toEqual({
      width: 120,
      height: 80,
    })
    await renderer.unmount()
    expect(image.removed).toBe(true)
    expect(revoke).toHaveBeenCalledWith(image.src)
  } finally {
    configureClientAssetPolicy(null)
    revoke.mockRestore()
    fetcher.mockRestore()
    Object.defineProperty(globalThis, 'Image', { value: originalImage, configurable: true })
    restoreBrowser()
  }
})

test('does not reuse dimensions when returning to an earlier image URL', async () => {
  images.length = 0
  const restoreBrowser = installBrowserFixture()
  const originalImage = globalThis.Image
  Object.defineProperty(globalThis, 'Image', { value: FakeImage, configurable: true })
  configureClientAssetPolicy(null)
  const renderer = await create(<Preview source="https://first.example/a.png" />)
  try {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
      images[0]?.onload?.()
    })
    expect(renderer.scene.findByProps({ name: 'preview' }).props.userData.dimensions).toEqual({
      width: 120,
      height: 80,
    })
    await act(async () => {
      await renderer.update(<Preview source="https://second.example/b.png" />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    await act(async () => {
      await renderer.update(<Preview source="https://first.example/a.png" />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(renderer.scene.findByProps({ name: 'preview' }).props.userData.dimensions).toBeNull()
  } finally {
    await renderer.unmount()
    configureClientAssetPolicy(null)
    Object.defineProperty(globalThis, 'Image', { value: originalImage, configurable: true })
    restoreBrowser()
  }
})
