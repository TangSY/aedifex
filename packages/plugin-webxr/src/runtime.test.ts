import { describe, expect, test } from 'bun:test'
import { DefaultXRController, DefaultXRHand } from '@react-three/xr'
import {
  createWebXRStore,
  requestWebXRSession,
  resolveRuntimeSource,
  VisibleXRController,
  VisibleXRHand,
} from './runtime'

describe('WebXR runtime selection', () => {
  test('uses a native headset when immersive VR is supported', () => {
    expect(resolveRuntimeSource({ development: true, nativeSupported: true })).toBe('native')
  })

  test('uses IWER only for local development without native XR', () => {
    expect(resolveRuntimeSource({ development: true, nativeSupported: false })).toBe('emulated')
    expect(resolveRuntimeSource({ development: false, nativeSupported: false })).toBe('unsupported')
  })
})

describe('WebXR tracked input models', () => {
  test('uses the default profile controller and hand models', () => {
    const store = createWebXRStore()

    expect(store.getState().controller).toBe(VisibleXRController)
    expect(store.getState().hand).toBe(VisibleXRHand)
    expect(VisibleXRController({}).type).toBe(DefaultXRController)
    expect(VisibleXRController({}).props.model).not.toBe(false)
    expect(VisibleXRHand({}).type).toBe(DefaultXRHand)
    expect(VisibleXRHand({}).props.model).not.toBe(false)

    store.destroy()
  })
})

test('requests native VR immediately with local-floor and tracked hands', async () => {
  const previous = Object.getOwnPropertyDescriptor(navigator, 'xr')
  let requested = false
  let mode: string | undefined
  let options: XRSessionInit | undefined
  const session = {} as XRSession
  Object.defineProperty(navigator, 'xr', {
    configurable: true,
    value: {
      requestSession(nextMode: string, nextOptions: XRSessionInit) {
        requested = true
        mode = nextMode
        options = nextOptions
        return Promise.resolve(session)
      },
    },
  })
  try {
    const store = { getState: () => ({ domOverlayRoot: undefined }) }
    const result = requestWebXRSession(store as ReturnType<typeof createWebXRStore>)
    expect(requested).toBe(true)
    expect(mode).toBe('immersive-vr')
    expect(options?.requiredFeatures).toEqual(['local-floor'])
    expect(options?.optionalFeatures).toContain('hand-tracking')
    expect(await result).toBe(session)
  } finally {
    if (previous) Object.defineProperty(navigator, 'xr', previous)
    else Reflect.deleteProperty(navigator, 'xr')
  }
})
