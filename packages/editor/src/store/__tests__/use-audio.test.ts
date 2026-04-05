/**
 * Tests for useAudio store.
 *
 * The store uses zustand/persist which writes to localStorage. We mock
 * localStorage so tests remain hermetic (no cross-test pollution, no
 * "window is not defined" errors in the node environment).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock localStorage before the module is imported so persist doesn't crash
// in the node test environment.
// ---------------------------------------------------------------------------
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
    get length() {
      return Object.keys(store).length
    },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  }
})()

vi.stubGlobal('localStorage', localStorageMock)

// Import AFTER stubbing globals
const { default: useAudio } = await import('../use-audio')

describe('useAudio', () => {
  beforeEach(() => {
    // Clear localStorage and reset store to defaults for each test
    localStorageMock.clear()
    useAudio.setState({
      masterVolume: 70,
      sfxVolume: 50,
      radioVolume: 25,
      isRadioPlaying: false,
      muted: false,
      autoplay: true,
    })
  })

  afterEach(() => {
    localStorageMock.clear()
  })

  describe('initial state', () => {
    it('masterVolume defaults to 70', () => {
      expect(useAudio.getState().masterVolume).toBe(70)
    })

    it('sfxVolume defaults to 50', () => {
      expect(useAudio.getState().sfxVolume).toBe(50)
    })

    it('radioVolume defaults to 25', () => {
      expect(useAudio.getState().radioVolume).toBe(25)
    })

    it('muted defaults to false', () => {
      expect(useAudio.getState().muted).toBe(false)
    })

    it('autoplay defaults to true', () => {
      expect(useAudio.getState().autoplay).toBe(true)
    })

    it('isRadioPlaying defaults to false', () => {
      expect(useAudio.getState().isRadioPlaying).toBe(false)
    })
  })

  describe('setMasterVolume()', () => {
    it('updates masterVolume', () => {
      useAudio.getState().setMasterVolume(90)
      expect(useAudio.getState().masterVolume).toBe(90)
    })

    it('sets masterVolume to 0 (mute edge case)', () => {
      useAudio.getState().setMasterVolume(0)
      expect(useAudio.getState().masterVolume).toBe(0)
    })

    it('does not affect other volume fields', () => {
      useAudio.getState().setMasterVolume(100)
      expect(useAudio.getState().sfxVolume).toBe(50)
      expect(useAudio.getState().radioVolume).toBe(25)
    })
  })

  describe('setSfxVolume()', () => {
    it('updates sfxVolume', () => {
      useAudio.getState().setSfxVolume(80)
      expect(useAudio.getState().sfxVolume).toBe(80)
    })

    it('does not affect masterVolume or radioVolume', () => {
      useAudio.getState().setSfxVolume(10)
      expect(useAudio.getState().masterVolume).toBe(70)
      expect(useAudio.getState().radioVolume).toBe(25)
    })
  })

  describe('setRadioVolume()', () => {
    it('updates radioVolume', () => {
      useAudio.getState().setRadioVolume(60)
      expect(useAudio.getState().radioVolume).toBe(60)
    })

    it('does not affect masterVolume or sfxVolume', () => {
      useAudio.getState().setRadioVolume(60)
      expect(useAudio.getState().masterVolume).toBe(70)
      expect(useAudio.getState().sfxVolume).toBe(50)
    })
  })

  describe('toggleMute()', () => {
    it('toggles muted from false to true', () => {
      useAudio.getState().toggleMute()
      expect(useAudio.getState().muted).toBe(true)
    })

    it('toggles muted from true back to false', () => {
      useAudio.setState({ muted: true })
      useAudio.getState().toggleMute()
      expect(useAudio.getState().muted).toBe(false)
    })

    it('does not affect other state fields', () => {
      useAudio.getState().toggleMute()
      expect(useAudio.getState().masterVolume).toBe(70)
      expect(useAudio.getState().autoplay).toBe(true)
    })
  })

  describe('setRadioPlaying()', () => {
    it('sets isRadioPlaying to true', () => {
      useAudio.getState().setRadioPlaying(true)
      expect(useAudio.getState().isRadioPlaying).toBe(true)
    })

    it('sets isRadioPlaying to false', () => {
      useAudio.setState({ isRadioPlaying: true })
      useAudio.getState().setRadioPlaying(false)
      expect(useAudio.getState().isRadioPlaying).toBe(false)
    })
  })

  describe('toggleRadioPlaying()', () => {
    it('toggles autoplay from false to true', () => {
      useAudio.setState({ isRadioPlaying: false })
      useAudio.getState().toggleRadioPlaying()
      expect(useAudio.getState().isRadioPlaying).toBe(true)
    })

    it('toggles autoplay from true back to false', () => {
      useAudio.setState({ isRadioPlaying: true })
      useAudio.getState().toggleRadioPlaying()
      expect(useAudio.getState().isRadioPlaying).toBe(false)
    })

    it('does not affect volume or muted state', () => {
      useAudio.getState().toggleRadioPlaying()
      expect(useAudio.getState().masterVolume).toBe(70)
      expect(useAudio.getState().muted).toBe(false)
    })
  })

  describe('setAutoplay()', () => {
    it('sets autoplay to false', () => {
      useAudio.getState().setAutoplay(false)
      expect(useAudio.getState().autoplay).toBe(false)
    })

    it('sets autoplay back to true', () => {
      useAudio.setState({ autoplay: false })
      useAudio.getState().setAutoplay(true)
      expect(useAudio.getState().autoplay).toBe(true)
    })
  })
})
