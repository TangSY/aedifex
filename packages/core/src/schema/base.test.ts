import { describe, expect, test } from 'bun:test'
import { BaseNode } from './base'
import { ZoneNode } from './nodes/zone'

const zoneInput = {
  id: 'zone_meta',
  name: 'Office',
  polygon: [
    [0, 0],
    [4, 0],
    [4, 3],
  ],
}

describe('node metadata contract', () => {
  test('defaults to an empty object when absent', () => {
    expect(BaseNode.parse({ id: 'node_1' }).metadata).toEqual({})
    expect(ZoneNode.parse(zoneInput).metadata).toEqual({})
  })

  test('carries arbitrary nested values under string keys', () => {
    const metadata = { ifcType: 'IfcWall', expressID: 42, layers: [{ name: 'gypsum' }] }

    expect(BaseNode.parse({ id: 'node_1', metadata }).metadata).toEqual(metadata)
    expect(ZoneNode.parse({ ...zoneInput, metadata }).metadata).toEqual(metadata)
  })

  test.each([[null], [[]], ['note'], [7], [true], [[{ legacy: ['value', null] }]]])(
    'preserves historical JSON metadata %p',
    (metadata) => {
      expect(BaseNode.parse({ id: 'node_1', metadata }).metadata).toEqual(metadata)
      expect(ZoneNode.parse({ ...zoneInput, metadata }).metadata).toEqual(metadata)
    },
  )

  test('drops keys whose value is undefined', () => {
    expect(BaseNode.parse({ id: 'node_1', metadata: { a: 1, b: undefined } }).metadata).toEqual({
      a: 1,
    })
  })
})
