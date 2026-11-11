import { expect, spyOn, test } from 'bun:test'
import { configureClientAssetPolicy } from '@aedifex/core'
import { extend } from '@react-three/fiber'
import { create } from '@react-three/test-renderer'
import { act } from 'react'
import { Object3D } from 'three'
import { installBrowserFixture } from '../__tests__/browser-fixture'
import { AssetBackground } from './asset-background'

test('background images obey the policy before being assigned to CSS', async () => {
  const restoreBrowser = installBrowserFixture()
  extend({ Span: Object3D })
  const fetcher = spyOn(globalThis, 'fetch').mockImplementation(
    async () => new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } }),
  )
  configureClientAssetPolicy(['https://allowed.example'])
  const renderer = await create(
    <AssetBackground imageUrl="https://blocked.example/image.png" style={{ color: 'red' }} />,
  )
  try {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(fetcher).not.toHaveBeenCalled()
    expect(renderer.scene.children[0]?.props.style.backgroundImage).toBeUndefined()
    await act(async () => {
      await renderer.update(
        <AssetBackground imageUrl="https://allowed.example/image.png" style={{ color: 'red' }} />,
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(renderer.scene.children[0]?.props.style.backgroundImage).toStartWith('url("blob:')
    expect(renderer.scene.children[0]?.props.style.color).toBe('red')
    expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe('error')
  } finally {
    await renderer.unmount()
    configureClientAssetPolicy(null)
    fetcher.mockRestore()
    restoreBrowser()
  }
})
