import { describe, expect, test } from 'bun:test'
import { isOpenAirRoom, openPlanRoomGroups } from './open-air-room'

function room(id: string, boundarySeparatorIds: string[], parentId = 'level_main') {
  return {
    id,
    type: 'zone',
    spaceRole: 'room',
    parentId,
    enclosureStatus: 'enclosed',
    autoFromWalls: true,
    boundarySeparatorIds,
  }
}

describe('room enclosure for lighting', () => {
  test('only a room on the same level can share an outside separator', () => {
    const main = room('main', ['outside'])
    const upper = room('upper', ['outside'], 'level_upper')
    const generic = { ...room('generic', ['outside']), spaceRole: 'generic' }
    expect(isOpenAirRoom({ main, upper, generic }, main)).toBe(true)
    expect(isOpenAirRoom({ main, upper, generic }, { ...main, autoFromWalls: false })).toBe(false)
  })

  test('groups indoor rooms transitively and leaves the room opening outdoors out of the group', () => {
    const first = room('a', ['first-second'])
    const second = room('b', ['first-second', 'second-third'])
    const third = room('c', ['second-third', 'third-porch'])
    const porch = room('porch', ['third-porch', 'outside'])
    const nodes = { third, porch, second, first }
    expect(isOpenAirRoom(nodes, third)).toBe(false)
    expect(isOpenAirRoom(nodes, porch)).toBe(true)
    expect(openPlanRoomGroups(nodes)).toEqual(
      new Map([
        ['c', 'a'],
        ['b', 'a'],
        ['a', 'a'],
      ]),
    )
  })
})
