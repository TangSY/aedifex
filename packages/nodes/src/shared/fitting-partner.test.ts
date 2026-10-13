import { describe, expect, test } from 'bun:test'
import { fittingPartnerId } from './fitting-partner'

describe('fitting partner metadata compatibility', () => {
  test('legacy non-object metadata does not participate in an alternate joint', () => {
    for (const metadata of [undefined, null, false, true, 3, 'legacy', []]) {
      expect(fittingPartnerId({ metadata, runId: 'duct-segment_current' })).toBeUndefined()
    }
  })

  test('only alternate-joint partner arrays can select another run', () => {
    for (const partnerIds of [undefined, null, false, 'pipe-segment_other', 3, {}]) {
      expect(
        fittingPartnerId({
          metadata: { altJoint: true, partnerIds },
          runId: 'pipe-segment_current',
        }),
      ).toBeUndefined()
    }
    expect(
      fittingPartnerId({
        metadata: { partnerIds: ['duct-segment_other'] },
        runId: 'duct-segment_current',
      }),
    ).toBeUndefined()
    expect(
      fittingPartnerId({
        metadata: {
          altJoint: true,
          partnerIds: [null, 42, 'duct-segment_current', 'duct-segment_other'],
        },
        runId: 'duct-segment_current',
      }),
    ).toBe('duct-segment_other')
    expect(
      fittingPartnerId({
        metadata: { altJoint: true, partnerIds: ['pipe-segment_current', 'pipe-segment_other'] },
        runId: 'pipe-segment_current',
      }),
    ).toBe('pipe-segment_other')
  })
})
