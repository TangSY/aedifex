import { expect, spyOn, test } from 'bun:test'
import { configureClientAssetPolicy } from '@aedifex/core'
import { create } from '@react-three/test-renderer'
import { act } from 'react'
import { BoxGeometry, Mesh, MeshStandardMaterial, Scene } from 'three'
import { USDZExporter } from 'three/addons/exporters/USDZExporter.js'
import { installBrowserFixture } from '../__tests__/browser-fixture'
import { CaptureRoomModel } from './layers/room-model-layer'

test('USDZ capture blocks unlisted sources and removes the loaded scene on policy change', async () => {
  const scene = new Scene()
  scene.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()))
  const bytes = new Uint8Array(await new USDZExporter().parseAsync(scene))
  const restore = installBrowserFixture()
  const fetcher = spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(bytes))
  configureClientAssetPolicy(['https://allowed.example'])
  const renderer = await create(
    <CaptureRoomModel
      mediaType="model/vnd.usdz+zip"
      sourceUrl="https://blocked.example/model.usdz"
      url="https://app.example/model.usdz"
    />,
  )
  try {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(fetcher).not.toHaveBeenCalled()
    expect(renderer.scene.children).toHaveLength(0)
    await act(async () => {
      await renderer.update(
        <CaptureRoomModel
          mediaType="model/vnd.usdz+zip"
          sourceUrl="https://allowed.example/model.usdz"
          url="https://allowed.example/model.usdz"
        />,
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(renderer.scene.children).toHaveLength(1)
    expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe('error')
    await act(async () => {
      configureClientAssetPolicy([])
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(renderer.scene.children).toHaveLength(0)
    expect(fetcher).toHaveBeenCalledTimes(1)
  } finally {
    await renderer.unmount()
    configureClientAssetPolicy(null)
    fetcher.mockRestore()
    restore()
  }
})
