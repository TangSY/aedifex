import { expect, mock, test } from 'bun:test'
import { configureClientAssetPolicy } from '@aedifex/core'
import { create } from '@react-three/test-renderer'
import { act } from 'react'
import { installBrowserFixture } from '../__tests__/browser-fixture'
import { CaptureStreamLayer } from './capture-runtime'
import { useCaptureSource } from './source-state'

test('capture resolver validates the authored URL before calling the host and validates its result', async () => {
  const restoreBrowser = installBrowserFixture()
  const dispose = mock(() => {})
  const resolveArtifact = mock(async (artifact: { uri: string }) => ({
    url: artifact.uri.endsWith('/bad')
      ? 'https://blocked.example/result'
      : 'https://allowed.example/result',
    dispose,
  }))
  const source = { resolveArtifact } as never
  const Renderer = ({ artifactUrl }: { artifactUrl: string | null }) => (
    <group name="capture" userData={{ artifactUrl }} />
  )
  const renderers = { model: Renderer } as never
  const view = (uri: string) => (
    <CaptureStreamLayer
      descriptor={{ coordinateFrames: [] } as never}
      packets={[]}
      renderers={renderers}
      scan={{} as never}
      source={source}
      stream={
        {
          id: 'model',
          kind: 'model',
          role: 'model',
          availability: 'ready',
          artifact: { id: 'a', mediaType: 'model/gltf-binary', uri },
        } as never
      }
      streamEpoch="one"
    />
  )
  configureClientAssetPolicy(['https://allowed.example'])
  const renderer = await create(view('https://blocked.example/model'))
  try {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(resolveArtifact).not.toHaveBeenCalled()
    expect(renderer.scene.findByProps({ name: 'capture' }).props.userData.artifactUrl).toBeNull()
    await act(async () => {
      await renderer.update(view('https://allowed.example/bad'))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(resolveArtifact).toHaveBeenCalledTimes(1)
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(renderer.scene.findByProps({ name: 'capture' }).props.userData.artifactUrl).toBeNull()
    await act(async () => {
      await renderer.update(view('https://allowed.example/good'))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(renderer.scene.findByProps({ name: 'capture' }).props.userData.artifactUrl).toBe(
      'https://allowed.example/result',
    )
    await act(async () => {
      configureClientAssetPolicy([])
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(renderer.scene.findByProps({ name: 'capture' }).props.userData.artifactUrl).toBeNull()
    expect(resolveArtifact).toHaveBeenCalledTimes(2)
    expect(dispose).toHaveBeenCalledTimes(2)
  } finally {
    await renderer.unmount()
    configureClientAssetPolicy(null)
    restoreBrowser()
  }
})

test('capture source clears an old descriptor before a stricter policy can resolve it again', async () => {
  const restoreBrowser = installBrowserFixture()
  const locator = { sessionId: 'one', manifestUrl: 'https://blocked.example/manifest.json' }
  const resolve = mock(async () => ({ describe: async () => ({ streams: [] }) }))
  function Preview() {
    const state = useCaptureSource(locator, resolve as never, { subscribe: false })
    return <group name={state.error ? 'error' : state.descriptor ? 'loaded' : 'loading'} />
  }
  configureClientAssetPolicy(null)
  const renderer = await create(<Preview />)
  try {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(renderer.scene.findAllByProps({ name: 'loaded' })).toHaveLength(1)
    await act(async () => {
      configureClientAssetPolicy([])
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(renderer.scene.findAllByProps({ name: 'loaded' })).toHaveLength(0)
    expect(renderer.scene.findAllByProps({ name: 'error' })).toHaveLength(1)
    expect(resolve).toHaveBeenCalledTimes(1)
  } finally {
    await renderer.unmount()
    configureClientAssetPolicy(null)
    restoreBrowser()
  }
})
