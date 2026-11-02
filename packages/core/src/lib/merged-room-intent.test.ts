import { describe, expect, test } from 'bun:test'
import { ZoneNode } from '../schema'
import { mergedRoomIntent } from './merged-room-intent'

const room = (id: string, name: string) =>
  ZoneNode.parse({
    id,
    parentId: 'level_test',
    name,
    polygon: [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ],
  })

describe('merged room intent', () => {
  test('keeps a named room and its authored fields even if the other room survives', () => {
    const plain = room('zone_a', 'Room 1')
    const named = ZoneNode.parse({
      ...room('zone_z', 'Studio'),
      roomNumber: 'A101',
      floorFinish: 'Oak',
      occupancy: 'Office',
      metadata: { daylight: { artificialLight: true, mechanicalVentilation: true } },
    })
    const before = JSON.stringify([plain, named])
    const result = mergedRoomIntent(plain, [plain, named])
    expect(result).toMatchObject({
      name: 'Studio',
      roomNumber: 'A101',
      floorFinish: 'Oak',
      occupancy: 'Office',
      metadata: { daylight: { artificialLight: true, mechanicalVentilation: true } },
    })
    expect((result.metadata as Record<string, unknown>)['aedifex:merged-room-intents']).toEqual([
      plain,
      named,
    ])
    expect(JSON.stringify([plain, named])).toBe(before)
  })

  test('retains conflicting metadata and names and does not overwrite an existing archive', () => {
    const a = ZoneNode.parse({
      ...room('zone_a', 'Studio'),
      metadata: { daylight: { artificialLight: true }, 'aedifex:merged-room-intents': 'existing' },
    })
    const b = ZoneNode.parse({
      ...room('zone_b', 'Kitchen'),
      metadata: { daylight: { artificialLight: false }, marker: 'kitchen-intent' },
    })
    const first = mergedRoomIntent(a, [a, b])
    const second = mergedRoomIntent(a, [b, a])
    const meta = first.metadata as Record<string, unknown>
    expect(meta['aedifex:merged-room-intents']).toBe('existing')
    expect(meta['aedifex:merged-room-intents:1']).toEqual([a, b])
    expect(first.name).toBe(second.name)
    expect((second.metadata as Record<string, unknown>)['aedifex:merged-room-intents:1']).toEqual([
      b,
      a,
    ])
  })

  test('leaves unchanged rooms alone', () => {
    const a = room('zone_a', 'Studio')
    expect(mergedRoomIntent(a, [a])).toEqual({})
  })

  test('keeps untrusted metadata keys as data without changing object prototypes', () => {
    const hostile = JSON.parse('{"__proto__":{"polluted":true},"label":"kept"}')
    const a = { ...room('zone_a', 'Studio'), metadata: hostile } as ZoneNode
    const b = room('zone_b', 'Room 1')
    const metadata = mergedRoomIntent(a, [a, b]).metadata as Record<string, unknown>
    expect(Object.getPrototypeOf(metadata)).toBeNull()
    expect(Object.hasOwn(metadata, '__proto__')).toBe(true)
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined()
    expect(metadata.label).toBe('kept')
  })
})
