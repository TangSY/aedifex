import { describe, expect, test } from 'bun:test'
import { hasSegmentMaterialOverride, RoofNode, RoofSegmentNode } from '@aedifex/core'
import { roofSegmentDefinition } from '../roof-segment/definition'
import { roofDefinition } from './definition'
import { roofSlots } from './slots'

describe('roof paint slots', () => {
  test('preserves roof and segment slot refs through schema parsing', () => {
    const roof = RoofNode.parse({
      slots: { shingle: 'library:roof-terracottatiles' },
    })
    const segment = RoofSegmentNode.parse({
      slots: { fascia: 'library:concrete-drywall' },
    })

    expect(roof.slots).toEqual({ shingle: 'library:roof-terracottatiles' })
    expect(segment.slots).toEqual({ fascia: 'library:concrete-drywall' })
  })

  test('declares the same four slots on roof and roof segment definitions', () => {
    const expected = roofSlots()

    expect(roofDefinition.capabilities.slots?.(RoofNode.parse({}))).toEqual(expected)
    expect(roofSegmentDefinition.capabilities.slots?.(RoofSegmentNode.parse({}))).toEqual(expected)
  })

  test('treats a slot-only segment as a material override', () => {
    const segment = RoofSegmentNode.parse({
      slots: { soffit: 'library:preset-softwhite' },
    })

    expect(hasSegmentMaterialOverride(segment)).toBe(true)
  })
})
