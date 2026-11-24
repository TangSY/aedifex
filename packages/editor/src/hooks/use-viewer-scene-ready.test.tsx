import { expect, jest, spyOn, test } from 'bun:test'
import { act, create } from '@react-three/test-renderer'
import { installBrowserFixture } from '../components/ui/__tests__/browser-fixture'
import { useViewerSceneReady } from './use-viewer-scene-ready'

const WAITING_FOR_VIEWER = {
  isSceneDataLoading: false,
  isViewerSceneReady: false,
  sceneReadyKey: 1,
}

test('a late renderer cannot re-block the current scene after its deadline', async () => {
  let canShowScene = false
  function Editor(props: Parameters<typeof useViewerSceneReady>[0]) {
    canShowScene = useViewerSceneReady(props)
    return null
  }

  const restoreBrowser = installBrowserFixture()
  const warning = spyOn(console, 'warn').mockImplementation(() => {})
  jest.useFakeTimers()
  let renderer: Awaited<ReturnType<typeof create>> | undefined

  const advance = (ms: number) =>
    act(async () => {
      jest.advanceTimersByTime(ms)
    })

  try {
    renderer = await create(<Editor {...WAITING_FOR_VIEWER} isSceneDataLoading />)
    await advance(8000)
    expect(canShowScene).toBe(false)

    await renderer.update(<Editor {...WAITING_FOR_VIEWER} />)
    await advance(7999)
    expect(canShowScene).toBe(false)
    await advance(1)
    expect(canShowScene).toBe(true)

    await renderer.update(<Editor {...WAITING_FOR_VIEWER} isViewerSceneReady />)
    await renderer.update(<Editor {...WAITING_FOR_VIEWER} />)
    expect(canShowScene).toBe(true)

    await renderer.update(<Editor {...WAITING_FOR_VIEWER} isSceneDataLoading />)
    expect(canShowScene).toBe(false)
    await renderer.update(<Editor {...WAITING_FOR_VIEWER} sceneReadyKey={2} />)
    expect(canShowScene).toBe(false)

    await renderer.update(<Editor {...WAITING_FOR_VIEWER} isViewerSceneReady sceneReadyKey={2} />)
    await advance(8000)
    expect(canShowScene).toBe(true)

    await renderer.update(<Editor {...WAITING_FOR_VIEWER} sceneReadyKey={3} />)
    await advance(7999)
    expect(canShowScene).toBe(false)
    await advance(1)
    expect(canShowScene).toBe(true)

    const readinessWarnings = warning.mock.calls.filter(([message]) =>
      String(message).startsWith('[editor] viewer scene readiness timed out'),
    )
    expect(readinessWarnings).toEqual([
      [
        '[editor] viewer scene readiness timed out; showing editor shell anyway',
        { sceneReadyKey: 1 },
      ],
      [
        '[editor] viewer scene readiness timed out; showing editor shell anyway',
        { sceneReadyKey: 3 },
      ],
    ])
  } finally {
    try {
      await renderer?.unmount()
    } finally {
      jest.useRealTimers()
      warning.mockRestore()
      restoreBrowser()
    }
  }
})
