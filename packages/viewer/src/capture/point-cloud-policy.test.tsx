import { expect, spyOn, test } from 'bun:test'
import { configureClientAssetPolicy } from '@aedifex/core'
import { create } from '@react-three/test-renderer'
import { act } from 'react'
import { installBrowserFixture } from '../__tests__/browser-fixture'
import { CapturePointCloudLayer } from './layers/point-cloud-layer'

test('capture point clouds check the original source and do not reuse data after policy changes', async () => {
  const restoreBrowser = installBrowserFixture()
  const ply =
    'ply\nformat ascii 1.0\nelement vertex 1\nproperty float x\nproperty float y\nproperty float z\nend_header\n1 2 3\n'
  const fetcher = spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(ply))
  configureClientAssetPolicy(['https://allowed.example'])
  const renderer = await create(
    <CapturePointCloudLayer
      artifactSourceUrl="https://blocked.example/a.ply"
      artifactUrl="https://app.example/a.ply"
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
        <CapturePointCloudLayer
          artifactSourceUrl="https://allowed.example/a.ply"
          artifactUrl="https://allowed.example/a.ply"
        />,
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe('error')
    expect(renderer.scene.children[0]?.props.geometry.getAttribute('position').count).toBe(1)
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
    restoreBrowser()
  }
})
