import { describe, expect, test } from 'bun:test'
import { AnyNode } from '../types'

/**
 * Minimal fixtures: each entry is the smallest object that satisfies the
 * corresponding kind's required (non-defaulted) fields. The discriminated
 * union should accept these and fill in every default. Roundtripping
 * (parse → parse) should be a no-op.
 *
 * Required fields per kind were determined by reading the node schemas
 * (see /packages/core/src/schema/nodes/*.ts) — any field without `.default()`
 * or `.optional()` must be present here.
 */
const FIXTURES: Record<string, Record<string, unknown>> = {
  site: { id: 'site_a', type: 'site' },
  building: { id: 'building_a', type: 'building' },
  elevator: { id: 'elevator_a', type: 'elevator' },
  level: { id: 'level_a', type: 'level' },
  column: { id: 'column_a', type: 'column' },
  wall: {
    id: 'wall_a',
    type: 'wall',
    start: [0, 0],
    end: [1, 0],
  },
  fence: {
    id: 'fence_a',
    type: 'fence',
    start: [0, 0],
    end: [2, 0],
  },
  item: {
    id: 'item_a',
    type: 'item',
    asset: {
      id: 'asset-1',
      category: 'furniture',
      name: 'Chair',
      thumbnail: 'asset://thumbs/chair.png',
      src: 'asset://models/chair.glb',
    },
  },
  zone: {
    id: 'zone_a',
    type: 'zone',
    name: 'Living Room',
    polygon: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  },
  slab: {
    id: 'slab_a',
    type: 'slab',
    polygon: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  },
  ceiling: {
    id: 'ceiling_a',
    type: 'ceiling',
    polygon: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  },
  roof: { id: 'roof_a', type: 'roof' },
  // RoofSegmentNode uses objectId('rseg')
  'roof-segment': { id: 'rseg_a', type: 'roof-segment' },
  shelf: { id: 'shelf_a', type: 'shelf' },
  stair: { id: 'stair_a', type: 'stair' },
  // StairSegmentNode uses objectId('sseg')
  'stair-segment': { id: 'sseg_a', type: 'stair-segment' },
  scan: {
    id: 'scan_a',
    type: 'scan',
    url: 'asset://scan.glb',
  },
  guide: {
    id: 'guide_a',
    type: 'guide',
    url: 'asset://guide.png',
  },
  spawn: { id: 'spawn_a', type: 'spawn' },
  window: { id: 'window_a', type: 'window' },
  door: { id: 'door_a', type: 'door' },
  // BoxVentNode uses objectId('bvent')
  'box-vent': { id: 'bvent_a', type: 'box-vent' },
  // RidgeVentNode uses objectId('rvent')
  'ridge-vent': { id: 'rvent_a', type: 'ridge-vent' },
  chimney: { id: 'chimney_a', type: 'chimney' },
  // SolarPanelNode uses objectId('solarpanel')
  'solar-panel': { id: 'solarpanel_a', type: 'solar-panel' },
  skylight: { id: 'skylight_a', type: 'skylight' },
  dormer: { id: 'dormer_a', type: 'dormer' },
}

describe('AnyNode discriminated union', () => {
  describe('every kind parses from minimal fixture', () => {
    for (const [kind, fixture] of Object.entries(FIXTURES)) {
      test(`${kind} parses and preserves type discriminator`, () => {
        const parsed = AnyNode.parse(fixture)
        expect(parsed.type).toBe(kind as typeof parsed.type)
        expect(parsed.id as string).toBe(fixture.id as string)
      })
    }
  })

  describe('every kind is idempotent', () => {
    for (const [kind, fixture] of Object.entries(FIXTURES)) {
      test(`${kind}: parse(parse(x)) === parse(x)`, () => {
        const once = AnyNode.parse(fixture)
        const twice = AnyNode.parse(once)
        expect(twice).toEqual(once)
      })
    }
  })

  describe('discriminator violations', () => {
    test('rejects missing type discriminator', () => {
      const result = AnyNode.safeParse({ id: 'x' })
      expect(result.success).toBe(false)
      if (!result.success) {
        // Zod's discriminator error mentions the invalid value
        expect(result.error.message.toLowerCase()).toMatch(/discriminator|invalid|required/)
      }
    })

    test('rejects unknown discriminator value', () => {
      const result = AnyNode.safeParse({ id: 'x', type: 'unknown-kind' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message.toLowerCase()).toMatch(/discriminator|invalid/)
      }
    })

    test('rejects null type', () => {
      const result = AnyNode.safeParse({ id: 'x', type: null })
      expect(result.success).toBe(false)
    })
  })
})
