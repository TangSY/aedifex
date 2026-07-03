import { describe, expect, it } from 'vitest'
import type { AnyNode } from '@aedifex/core'
import { resolveAssetSnapTarget, resolveNodeSnapTarget } from './snap-target-badge'

describe('resolveAssetSnapTarget', () => {
  it('maps wall-hosted catalog assets to a wall badge', () => {
    expect(resolveAssetSnapTarget('wall')).toBe('wall')
    expect(resolveAssetSnapTarget('wall-side')).toBe('wall')
  })

  it('maps ceiling-hosted catalog assets to a ceiling badge', () => {
    expect(resolveAssetSnapTarget('ceiling')).toBe('ceiling')
  })

  it('does not badge floor assets', () => {
    expect(resolveAssetSnapTarget(undefined)).toBeNull()
  })
})

describe('resolveNodeSnapTarget', () => {
  it('prefers roof attachment when a node is hosted by a roof segment', () => {
    const node = {
      id: 'window_1',
      type: 'window',
      roofSegmentId: 'roof-segment_1',
    } as unknown as AnyNode

    expect(resolveNodeSnapTarget(node)).toBe('roof')
  })

  it('badges gutter-hosted downspouts as roof accessories', () => {
    const node = {
      id: 'downspout_1',
      type: 'downspout',
      gutterId: 'gutter_1',
    } as unknown as AnyNode

    expect(resolveNodeSnapTarget(node)).toBe('roof')
  })
})
