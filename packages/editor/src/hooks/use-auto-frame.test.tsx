import { expect, test } from 'bun:test'
import { emitter, useScene } from '@aedifex/core'
import { act, create } from '@react-three/test-renderer'
import { subscribeAutoFrame, useAutoFrame } from './use-auto-frame'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
globalThis.requestAnimationFrame ??= () => 0
globalThis.cancelAnimationFrame ??= () => {}

test('frames only an empty-to-loaded transition without emitting a manual camera event', async () => {
  const previous = useScene.getState().nodes
  const requests: unknown[] = []
  const manual: unknown[] = []
  const unsubscribe = subscribeAutoFrame((bounds) => requests.push(bounds))
  const record = (event: unknown) => manual.push(event)
  emitter.on('camera-controls:fit-scene', record)
  useScene.setState({ nodes: {} })
  function Host() {
    useAutoFrame()
    return null
  }
  const renderer = await create(<Host />)
  try {
    await act(async () => {
      useScene.setState({
        nodes: {
          wall_test: {
            id: 'wall_test',
            type: 'wall',
            parentId: null,
            start: [3, 4],
            end: [5, 6],
          } as never,
        },
      })
    })
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({ center: [4, 5], size: [2, 2] })
    expect(manual).toEqual([])
    await act(async () => {
      useScene.setState({ nodes: { ...useScene.getState().nodes } })
    })
    expect(requests).toHaveLength(1)
  } finally {
    await renderer.unmount()
    unsubscribe()
    emitter.off('camera-controls:fit-scene', record)
    useScene.setState({ nodes: previous })
  }
})

test('frames an already-loaded scene once after readiness, deferring XR and respecting preview', async () => {
  const previous = useScene.getState().nodes
  const requests: unknown[] = []
  const unsubscribe = subscribeAutoFrame((bounds) => requests.push(bounds))
  useScene.setState({
    nodes: {
      wall_test: {
        id: 'wall_test',
        type: 'wall',
        parentId: null,
        start: [3, 4],
        end: [5, 6],
      } as never,
    },
  })
  function Host(props: {
    ready: boolean
    readyKey: number
    deferReady?: boolean
    suppressReady?: boolean
  }) {
    useAutoFrame(props)
    return null
  }
  const renderer = await create(<Host ready={false} readyKey={1} />)
  try {
    await renderer.update(<Host ready readyKey={1} />)
    expect(requests).toHaveLength(1)
    await renderer.update(<Host ready={false} readyKey={1} />)
    await renderer.update(<Host ready readyKey={1} />)
    expect(requests).toHaveLength(1)
    await renderer.update(<Host ready readyKey={2} deferReady />)
    expect(requests).toHaveLength(1)
    await renderer.update(<Host ready readyKey={2} />)
    expect(requests).toHaveLength(2)
    await renderer.update(<Host ready readyKey={3} suppressReady />)
    await renderer.update(<Host ready readyKey={3} />)
    expect(requests).toHaveLength(2)
  } finally {
    await renderer.unmount()
    unsubscribe()
    useScene.setState({ nodes: previous })
  }
})
