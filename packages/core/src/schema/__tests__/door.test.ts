import { describe, expect, test } from 'bun:test'
import { DoorNode } from '../nodes/door'

const MIN_DOOR = { id: 'door_a', type: 'door' as const }

describe('DoorNode.parse', () => {
  describe('defaults', () => {
    test('minimal door supplies all dimension/operation defaults', () => {
      const d = DoorNode.parse(MIN_DOOR)
      expect(d.width).toBe(0.9)
      expect(d.height).toBe(2.1)
      expect(d.doorCategory).toBe('interior')
      expect(d.doorType).toBe('hinged')
      expect(d.leafCount).toBe(1)
      expect(d.operationState).toBe(0)
    })

    test('default segments: two panels totalling 1.0 in heightRatio', () => {
      const d = DoorNode.parse(MIN_DOOR)
      expect(d.segments).toHaveLength(2)
      expect(d.segments[0].heightRatio).toBe(0.4)
      expect(d.segments[1].heightRatio).toBe(0.6)
      expect(d.segments[0].type).toBe('panel')
    })

    test('idempotent', () => {
      const once = DoorNode.parse(MIN_DOOR)
      const twice = DoorNode.parse(once)
      expect(twice).toEqual(once)
    })
  })

  describe('leafCount union (1|2|3|4)', () => {
    test('accepts leafCount: 1', () => {
      expect(DoorNode.parse({ ...MIN_DOOR, leafCount: 1 }).leafCount).toBe(1)
    })

    test('accepts leafCount: 2', () => {
      expect(DoorNode.parse({ ...MIN_DOOR, leafCount: 2 }).leafCount).toBe(2)
    })

    test('accepts leafCount: 3', () => {
      expect(DoorNode.parse({ ...MIN_DOOR, leafCount: 3 }).leafCount).toBe(3)
    })

    test('accepts leafCount: 4', () => {
      expect(DoorNode.parse({ ...MIN_DOOR, leafCount: 4 }).leafCount).toBe(4)
    })

    test('rejects leafCount: 5 (out of union)', () => {
      expect(() => DoorNode.parse({ ...MIN_DOOR, leafCount: 5 })).toThrow()
    })

    test('rejects leafCount: 0 (out of union)', () => {
      expect(() => DoorNode.parse({ ...MIN_DOOR, leafCount: 0 })).toThrow()
    })

    test('rejects leafCount: 1.5 (non-literal numeric)', () => {
      expect(() => DoorNode.parse({ ...MIN_DOOR, leafCount: 1.5 })).toThrow()
    })
  })

  describe('operationState range', () => {
    test('accepts 0 (closed)', () => {
      expect(DoorNode.parse({ ...MIN_DOOR, operationState: 0 }).operationState).toBe(0)
    })

    test('accepts 1 (fully open)', () => {
      expect(DoorNode.parse({ ...MIN_DOOR, operationState: 1 }).operationState).toBe(1)
    })

    test('accepts 0.5 (half open)', () => {
      expect(DoorNode.parse({ ...MIN_DOOR, operationState: 0.5 }).operationState).toBe(0.5)
    })

    test('rejects negative operationState', () => {
      expect(() => DoorNode.parse({ ...MIN_DOOR, operationState: -0.1 })).toThrow()
    })

    test('rejects operationState > 1', () => {
      expect(() => DoorNode.parse({ ...MIN_DOOR, operationState: 1.1 })).toThrow()
    })
  })

  describe('swingAngle range', () => {
    test('accepts 0', () => {
      expect(DoorNode.parse({ ...MIN_DOOR, swingAngle: 0 }).swingAngle).toBe(0)
    })

    test('accepts PI/2 (90 degrees)', () => {
      expect(DoorNode.parse({ ...MIN_DOOR, swingAngle: Math.PI / 2 }).swingAngle).toBe(Math.PI / 2)
    })

    test('rejects swingAngle > PI/2', () => {
      expect(() =>
        DoorNode.parse({ ...MIN_DOOR, swingAngle: Math.PI / 2 + 0.01 }),
      ).toThrow()
    })

    test('rejects negative swingAngle', () => {
      expect(() => DoorNode.parse({ ...MIN_DOOR, swingAngle: -0.01 })).toThrow()
    })
  })

  describe('garagePanelCount range', () => {
    test('rejects garagePanelCount: 0', () => {
      expect(() => DoorNode.parse({ ...MIN_DOOR, garagePanelCount: 0 })).toThrow()
    })

    test('rejects garagePanelCount: 13', () => {
      expect(() => DoorNode.parse({ ...MIN_DOOR, garagePanelCount: 13 })).toThrow()
    })

    test('accepts garagePanelCount: 4 (default)', () => {
      expect(DoorNode.parse(MIN_DOOR).garagePanelCount).toBe(4)
    })
  })

  describe('openingKind / doorType / openingShape enums', () => {
    test('rejects unknown openingKind', () => {
      expect(() => DoorNode.parse({ ...MIN_DOOR, openingKind: 'portal' })).toThrow()
    })

    test('rejects unknown doorType', () => {
      expect(() => DoorNode.parse({ ...MIN_DOOR, doorType: 'revolving' })).toThrow()
    })

    test('accepts each valid doorType', () => {
      const allTypes = [
        'hinged',
        'double',
        'french',
        'folding',
        'pocket',
        'barn',
        'sliding',
        'garage-sectional',
        'garage-rollup',
        'garage-tiltup',
      ]
      for (const dt of allTypes) {
        const d = DoorNode.parse({ ...MIN_DOOR, doorType: dt })
        expect(d.doorType).toBe(dt as typeof d.doorType)
      }
    })
  })
})
