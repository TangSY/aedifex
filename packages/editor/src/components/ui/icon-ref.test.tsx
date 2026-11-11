import { expect, spyOn, test } from 'bun:test'
import { configureClientAssetPolicy } from '@aedifex/core'
import { extend } from '@react-three/fiber'
import { create } from '@react-three/test-renderer'
import { act } from 'react'
import { Object3D } from 'three'
import { installBrowserFixture } from './__tests__/browser-fixture'
import { IconRefImage } from './icon-ref'

test('plugin icons retain currentColor masks and reject unlisted image sources', async () => {
  const restoreBrowser = installBrowserFixture()
  extend({ Img: Object3D, Span: Object3D })
  const fetcher = spyOn(globalThis, 'fetch').mockImplementation(async () => new Response())
  configureClientAssetPolicy(null)
  const svg = 'data:image/svg+xml,%3Csvg%20fill%3D%22currentColor%22%2F%3E'
  const renderer = await create(<IconRefImage size={16} src={svg} />)
  try {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(renderer.scene.children[0]?.props.style.mask).toContain(svg)
    await act(async () => {
      configureClientAssetPolicy(['https://allowed.example'])
      await renderer.update(<IconRefImage src="https://blocked.example/icon.svg" />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(renderer.scene.children).toHaveLength(0)
    expect(fetcher).not.toHaveBeenCalled()
  } finally {
    await renderer.unmount()
    configureClientAssetPolicy(null)
    fetcher.mockRestore()
    restoreBrowser()
  }
})
