// Copyright (c) 2026 Pascal Group Inc.
// SPDX-License-Identifier: MIT

type RoomZone = {
  type?: string
  id?: string
  parentId?: string | null
  spaceRole?: string
  roomType?: string
  enclosureStatus?: string
  autoFromWalls?: boolean
  boundarySeparatorIds?: readonly string[]
}

type RoomNodes = Readonly<Record<string, RoomZone | undefined>>

function hasOpenSide(zone: RoomZone, isShared: (separator: string) => boolean): boolean {
  if (zone.roomType === 'porch' || zone.roomType === 'deck' || zone.roomType === 'patio')
    return true
  if (zone.enclosureStatus === 'open') return true
  if (zone.enclosureStatus === 'enclosed' && !zone.autoFromWalls) return false
  // A wall-derived room is marked enclosed when its boundary loop closes, even where the loop
  // includes an opening. An unshared separator is an opening to the outdoors.
  return zone.boundarySeparatorIds?.some((separator) => !isShared(separator)) ?? false
}

export function isOpenAirRoom(nodes: RoomNodes, zone: RoomZone): boolean {
  let shared: Set<string> | undefined
  return hasOpenSide(zone, (separator) => {
    if (!shared) {
      shared = new Set<string>()
      for (const other of Object.values(nodes)) {
        if (
          other?.type !== 'zone' ||
          other.id === zone.id ||
          other.parentId !== zone.parentId ||
          other.spaceRole !== 'room'
        )
          continue
        for (const id of other.boundarySeparatorIds ?? []) shared.add(id)
      }
    }
    return shared.has(separator)
  })
}

/** Indoor rooms linked by open sides share the lowest member id as their lighting group. */
export function openPlanRoomGroups(nodes: RoomNodes): Map<string, string> {
  const rooms = new Map<string, RoomZone>()
  const byLevel = new Map<string | null | undefined, Map<string, Set<string>>>()
  for (const [id, zone] of Object.entries(nodes)) {
    if (zone?.type !== 'zone' || zone.spaceRole !== 'room') continue
    const roomId = zone.id ?? id
    rooms.set(roomId, zone)
    let separators = byLevel.get(zone.parentId)
    if (!separators) {
      separators = new Map()
      byLevel.set(zone.parentId, separators)
    }
    for (const separator of zone.boundarySeparatorIds ?? []) {
      let neighbors = separators.get(separator)
      if (!neighbors) {
        neighbors = new Set()
        separators.set(separator, neighbors)
      }
      neighbors.add(roomId)
    }
  }

  const parents = new Map<string, string>()
  for (const [id, zone] of rooms) {
    const separators = byLevel.get(zone.parentId)
    if (!hasOpenSide(zone, (separator) => (separators?.get(separator)?.size ?? 0) > 1))
      parents.set(id, id)
  }

  function find(id: string): string {
    let root = id
    while (parents.get(root) !== root) root = parents.get(root)!
    while (id !== root) {
      const parent = parents.get(id)!
      parents.set(id, root)
      id = parent
    }
    return root
  }

  for (const separators of byLevel.values()) {
    for (const neighbors of separators.values()) {
      let root: string | undefined
      for (const id of neighbors) {
        if (!parents.has(id)) continue
        const member = find(id)
        if (root === undefined) root = member
        else if (root !== member) {
          const first = root < member ? root : member
          const second = root < member ? member : root
          parents.set(second, first)
          root = first
        }
      }
    }
  }

  const sizes = new Map<string, number>()
  for (const id of parents.keys()) {
    const root = find(id)
    sizes.set(root, (sizes.get(root) ?? 0) + 1)
  }
  const groups = new Map<string, string>()
  for (const id of parents.keys()) {
    const root = find(id)
    if ((sizes.get(root) ?? 0) > 1) groups.set(id, root)
  }
  return groups
}
