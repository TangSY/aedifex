import type { ZoneNode } from '../schema/nodes/zone'
import { metadataRecord } from '../utils/metadata-record'
import { isAllocatedRoomName } from './room-name'

const MERGED_ROOM_INTENTS = 'aedifex:merged-room-intents'

function intentScore(zone: ZoneNode): number {
  return (
    Number(!!zone.name && !isAllocatedRoomName(zone.name)) +
    Number(!!zone.roomNumber) +
    Number(!!zone.floorFinish) +
    Number(!!zone.wallFinish) +
    Number(!!zone.ceilingFinish) +
    Number(!!zone.occupancy) +
    Number(zone.ceilingHeight !== 2.7) +
    Number(zone.clearDimensionPolicy !== 'none') +
    Number(Object.keys(metadataRecord(zone.metadata)).length > 0)
  )
}

/** Keep both authored intents recoverable when geometry joins their rooms. */
export function mergedRoomIntent(
  survivor: ZoneNode,
  rooms: readonly ZoneNode[],
): Partial<ZoneNode> {
  if (rooms.length < 2) return {}
  const ranked = [...rooms].sort(
    (a, b) =>
      intentScore(b) - intentScore(a) ||
      Number(b.id === survivor.id) - Number(a.id === survivor.id) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
  const named = ranked.find((room) => !!room.name && !isAllocatedRoomName(room.name)) ?? survivor
  const pick = <
    K extends 'roomNumber' | 'floorFinish' | 'wallFinish' | 'ceilingFinish' | 'occupancy',
  >(
    key: K,
  ) => ranked.find((room) => !!room[key])?.[key] ?? survivor[key]
  const metadata = Object.assign(
    Object.create(null) as Record<string, unknown>,
    ...[...ranked].reverse().map((room) => metadataRecord(room.metadata)),
  )
  let key = MERGED_ROOM_INTENTS
  let suffix = 1
  while (Object.hasOwn(metadata, key)) key = `${MERGED_ROOM_INTENTS}:${suffix++}`
  metadata[key] = rooms.map((room) => ({ ...room }))
  return {
    name: named.name,
    roomNumber: pick('roomNumber'),
    floorFinish: pick('floorFinish'),
    wallFinish: pick('wallFinish'),
    ceilingFinish: pick('ceilingFinish'),
    occupancy: pick('occupancy'),
    ceilingHeight:
      ranked.find((room) => room.ceilingHeight !== 2.7)?.ceilingHeight ?? survivor.ceilingHeight,
    clearDimensionPolicy:
      ranked.find((room) => room.clearDimensionPolicy !== 'none')?.clearDimensionPolicy ??
      survivor.clearDimensionPolicy,
    metadata,
  }
}
