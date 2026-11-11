import { expect, mock, spyOn, test } from 'bun:test'
import { configureClientAssetPolicy } from '@aedifex/core'
import { create } from '@react-three/test-renderer'
import { act } from 'react'
import { installBrowserFixture } from './__tests__/browser-fixture'
import { NodeIconImage } from './node-icon-image'

mock.module('next/image', () => ({
  default: (props: { src: string; unoptimized?: boolean }) => (
    <group name="image" userData={props} />
  ),
}))

test('checks node thumbnails before they reach the image optimizer', async () => {
  const restoreBrowser = installBrowserFixture()
  const fetcher = spyOn(globalThis, 'fetch').mockImplementation(
    (async () =>
      new Response(new Uint8Array([1]), {
        headers: { 'content-type': 'image/png' },
      })) as unknown as typeof fetch,
  )
  configureClientAssetPolicy(['https://allowed.example'])
  const renderer = await create(
    <NodeIconImage alt="" height={16} src="https://blocked.example/icon.png" width={16} />,
  )
  try {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(fetcher).not.toHaveBeenCalled()
    expect(renderer.scene.findAllByProps({ name: 'image' })).toHaveLength(0)
    await act(async () => {
      await renderer.update(
        <NodeIconImage alt="" height={16} src="https://allowed.example/icon.png" width={16} />,
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    const image = renderer.scene.findByProps({ name: 'image' }).props.userData
    expect(image.src.startsWith('blob:')).toBe(true)
    expect(image.unoptimized).toBe(true)
    expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe('error')
  } finally {
    await renderer.unmount()
    configureClientAssetPolicy(null)
    fetcher.mockRestore()
    restoreBrowser()
    mock.restore()
  }
})
