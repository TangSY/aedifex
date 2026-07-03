import { describe, expect, it } from 'vitest'
import { getDetachedAttachmentPreviewLift, stripTransient } from './placement-math'

describe('stripTransient', () => {
  it('removes placement-only metadata flags before commit', () => {
    expect(stripTransient({ isNew: true, isTransient: true, label: 'copy' })).toEqual({
      label: 'copy',
    })
  })
})

describe('getDetachedAttachmentPreviewLift', () => {
  it('raises attach-only item previews while they are detached from their host', () => {
    expect(getDetachedAttachmentPreviewLift('wall')).toBeGreaterThan(0)
    expect(getDetachedAttachmentPreviewLift('wall-side')).toBeGreaterThan(0)
    expect(getDetachedAttachmentPreviewLift('ceiling')).toBeGreaterThan(0)
  })

  it('keeps floor item previews on the floor', () => {
    expect(getDetachedAttachmentPreviewLift(undefined)).toBe(0)
  })
})
