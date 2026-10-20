import { beforeEach, describe, expect, test } from 'bun:test'
import { FOLLOW_AEDIFEX_STORAGE_KEY, useFollowAedifex } from './use-follow-pascal'

// Follow Aedifex's switch and its pause: touching the camera pauses it and offers "Resume following";
// a new build starts it again; the switch itself is the person's, kept across sessions.
beforeEach(() => {
  useFollowAedifex.setState({ on: true, paused: false, building: false })
})

describe('Follow Aedifex', () => {
  test('is on until the person turns it off, and turning it off clears a pause', () => {
    expect(useFollowAedifex.getState().on).toBe(true)
    useFollowAedifex.getState().pause()
    expect(useFollowAedifex.getState().paused).toBe(true)
    useFollowAedifex.getState().setOn(false)
    expect(useFollowAedifex.getState()).toMatchObject({ on: false, paused: false })
  })

  test('a pause waits for the person, and only matters while it is on', () => {
    useFollowAedifex.setState({ on: false })
    useFollowAedifex.getState().pause()
    expect(useFollowAedifex.getState().paused).toBe(false)
    useFollowAedifex.setState({ on: true })
    useFollowAedifex.getState().pause()
    expect(useFollowAedifex.getState().paused).toBe(true)
    useFollowAedifex.getState().resume()
    expect(useFollowAedifex.getState().paused).toBe(false)
  })

  test('a build that begins takes the camera again, even after a pause', () => {
    useFollowAedifex.getState().pause()
    useFollowAedifex.getState().beginBuild()
    expect(useFollowAedifex.getState()).toMatchObject({ paused: false, building: true })
    useFollowAedifex.getState().endBuild()
    expect(useFollowAedifex.getState().building).toBe(false)
  })

  test('only the switch is kept across sessions', () => {
    const persisted = (
      useFollowAedifex as unknown as {
        persist: { getOptions(): { partialize?: (state: unknown) => unknown; name?: string } }
      }
    ).persist.getOptions()
    expect(persisted.name).toBe(FOLLOW_AEDIFEX_STORAGE_KEY)
    expect(persisted.partialize?.({ on: false, paused: true, building: true })).toEqual({
      on: false,
    })
  })

  test('the pill offers itself only to a paused follower during a build', () => {
    const shows = () => {
      const { on, paused, building } = useFollowAedifex.getState()
      return on && paused && building
    }
    useFollowAedifex.getState().beginBuild()
    expect(shows()).toBe(false)
    useFollowAedifex.getState().pause()
    expect(shows()).toBe(true)
    useFollowAedifex.getState().endBuild()
    expect(shows()).toBe(false)
  })
})
