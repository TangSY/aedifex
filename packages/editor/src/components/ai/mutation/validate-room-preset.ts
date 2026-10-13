import { type AnyNode, type AnyNodeId, useScene } from '@aedifex/core'
import { useViewer } from '@aedifex/viewer'
import { getRoomPresetProvider } from '../runtime'
import type {
  InsertRoomPresetToolCall,
  SaveRoomPresetToolCall,
} from '../types/tool-call-types'
import type {
  ValidatedInsertRoomPreset,
  ValidatedSaveRoomPreset,
} from '../types/validated-types'

// ============================================================================
// Room Preset Validators
//
// save_room_preset / insert_room_preset are host-async actions executed by
// the RoomPresetProvider (see contracts/runtime.ts). Validation is purely
// local and synchronous: resolve the fuzzy roomName/presetName/levelName
// arguments the LLM sends into concrete zoneId/presetId/levelId values,
// and produce clear errorReason strings the LLM can relay to the user.
// ============================================================================

/** Case-insensitive bidirectional substring match ("书房" matches "日式书房"). */
function fuzzyNameMatch(candidate: string, query: string): boolean {
  const a = candidate.trim().toLowerCase()
  const b = query.trim().toLowerCase()
  if (!a || !b) return false
  return a.includes(b) || b.includes(a)
}

interface LevelEntry {
  id: string
  name: string
  level: number
}

function collectLevels(nodes: Record<string, AnyNode>): LevelEntry[] {
  const levels: LevelEntry[] = []
  for (const node of Object.values(nodes)) {
    if (node && node.type === 'level') {
      const l = node as AnyNode & { level?: number; name?: string }
      levels.push({
        id: node.id,
        name: l.name ?? `Level ${l.level ?? 0}`,
        level: l.level ?? 0,
      })
    }
  }
  return levels.sort((a, b) => a.level - b.level)
}

/**
 * Resolve a levelName argument ("2", "Second Floor", "二层", "level_abc")
 * against scene levels: exact id, fuzzy name, or numeric level index.
 * Returns null when nothing matches.
 */
function resolveLevelByName(
  levels: LevelEntry[],
  levelName: string,
): LevelEntry | null {
  const query = levelName.trim()
  if (!query) return null

  // 1. Exact node id (the LLM often echoes ids from the scene context)
  const byId = levels.find((l) => l.id === query)
  if (byId) return byId

  // 2. Fuzzy display-name match
  const byName = levels.filter((l) => fuzzyNameMatch(l.name, query))
  if (byName.length === 1) return byName[0]!
  if (byName.length > 1) {
    // Ambiguous fuzzy name — prefer an exact (case-insensitive) name match
    const exact = byName.find((l) => l.name.trim().toLowerCase() === query.toLowerCase())
    return exact ?? byName[0]!
  }

  // 3. Numeric token → level index ("2" / "2F" / "Level 2" → level === 2)
  const numMatch = query.match(/-?\d+/)
  if (numMatch) {
    const n = Number.parseInt(numMatch[0]!, 10)
    const byIndex = levels.find((l) => l.level === n)
    if (byIndex) return byIndex
  }

  return null
}

/** Walk up the parent chain to find the level ancestor of a node. */
function findLevelAncestorId(
  nodes: Record<string, AnyNode>,
  startId: string,
): string | null {
  let current: AnyNode | undefined = nodes[startId]
  const guard = new Set<string>()
  while (current) {
    if (current.type === 'level') return current.id
    const parentId = current.parentId as string | null | undefined
    if (!parentId || guard.has(parentId)) return null
    guard.add(parentId)
    current = nodes[parentId]
  }
  return null
}

function invalidSave(errorReason: string): ValidatedSaveRoomPreset {
  return {
    type: 'save_room_preset',
    status: 'invalid',
    zoneId: '',
    zoneName: '',
    errorReason,
  }
}

/**
 * Validate save_room_preset: fuzzy-match call.roomName against zone names
 * (optionally narrowed to the level resolved from call.levelName).
 *
 * Error cases produce LLM-actionable reasons:
 * - scene has no zones at all
 * - no zone matches → list available zone names
 * - multiple zones match → list candidates so the LLM can ask the user
 */
export function validateSaveRoomPreset(
  call: SaveRoomPresetToolCall,
): ValidatedSaveRoomPreset {
  const { nodes } = useScene.getState()
  const roomName = (call.roomName ?? '').trim()
  if (!roomName) {
    return invalidSave('roomName is required — which room should be saved as a preset?')
  }

  const levels = collectLevels(nodes as Record<string, AnyNode>)
  let levelFilterId: string | null = null
  if (call.levelName) {
    const level = resolveLevelByName(levels, call.levelName)
    if (!level) {
      const available = levels.map((l) => `"${l.name}"`).join(', ')
      return invalidSave(
        `Level "${call.levelName}" not found. Available levels: ${available || '(none)'}.`,
      )
    }
    levelFilterId = level.id
  }

  // Collect zones (optionally scoped to the resolved level). Skip ghost
  // preview zones — mirrors the isGhostNode filter in spatial-queries.ts.
  const zones: { id: string; name: string }[] = []
  for (const node of Object.values(nodes as Record<string, AnyNode>)) {
    if (!node || node.type !== 'zone') continue
    if ((node as { visible?: boolean }).visible === false) continue
    const meta = node.metadata as Record<string, unknown> | undefined
    if (meta?.isGhostPreview === true || meta?.isGhostRemoval === true) continue
    if (levelFilterId) {
      const zoneLevelId = findLevelAncestorId(nodes as Record<string, AnyNode>, node.id)
      if (zoneLevelId !== levelFilterId) continue
    }
    zones.push({ id: node.id, name: (node as AnyNode & { name?: string }).name ?? 'Zone' })
  }

  if (zones.length === 0) {
    return invalidSave(
      levelFilterId
        ? `The scene has no rooms (zones) on level "${call.levelName}". Create walls to form a room first, or name the zone with add_zone.`
        : 'The scene has no rooms (zones) yet. Create walls to form a room first, or define one with add_zone.',
    )
  }

  const matches = zones.filter((z) => fuzzyNameMatch(z.name, roomName))
  if (matches.length === 0) {
    const available = zones.map((z) => `"${z.name}"`).join(', ')
    return invalidSave(
      `No room matches "${roomName}". Available rooms: ${available}. Ask the user which room to save.`,
    )
  }
  if (matches.length > 1) {
    const candidates = matches.map((z) => `"${z.name}"`).join(', ')
    return invalidSave(
      `Multiple rooms match "${roomName}": ${candidates}. Ask the user which one to save as a preset.`,
    )
  }

  return {
    type: 'save_room_preset',
    status: 'valid',
    zoneId: matches[0]!.id,
    zoneName: matches[0]!.name,
  }
}

function invalidInsert(errorReason: string): ValidatedInsertRoomPreset {
  return {
    type: 'insert_room_preset',
    status: 'invalid',
    presetId: '',
    presetName: '',
    levelId: '',
    position: [0, 0],
    errorReason,
  }
}

/**
 * Validate insert_room_preset: fuzzy-match call.presetName against the
 * RoomPresetProvider's preset list, then resolve the target level
 * (call.levelName → fuzzy level match, default: active level) and the
 * floor-plane position (default: [0, 0]).
 */
export function validateInsertRoomPreset(
  call: InsertRoomPresetToolCall,
): ValidatedInsertRoomPreset {
  const presetName = (call.presetName ?? '').trim()
  if (!presetName) {
    return invalidInsert('presetName is required — which saved preset should be inserted?')
  }

  const presets = getRoomPresetProvider().list()
  if (presets.length === 0) {
    return invalidInsert(
      'The user has not saved any room presets yet. Suggest saving a room first with save_room_preset.',
    )
  }

  const matches = presets.filter((p) => fuzzyNameMatch(p.name, presetName))
  if (matches.length === 0) {
    const available = presets.map((p) => `"${p.name}"`).join(', ')
    return invalidInsert(
      `No saved preset matches "${presetName}". Available presets: ${available}. Ask the user which one to insert.`,
    )
  }
  if (matches.length > 1) {
    const candidates = matches.map((p) => `"${p.name}"`).join(', ')
    return invalidInsert(
      `Multiple presets match "${presetName}": ${candidates}. Ask the user which one to insert.`,
    )
  }

  // Resolve target level: explicit levelName → fuzzy match, else active level
  const { nodes } = useScene.getState()
  const levels = collectLevels(nodes as Record<string, AnyNode>)
  let levelId: string | null = null
  if (call.levelName) {
    const level = resolveLevelByName(levels, call.levelName)
    if (!level) {
      const available = levels.map((l) => `"${l.name}"`).join(', ')
      return invalidInsert(
        `Level "${call.levelName}" not found. Available levels: ${available || '(none)'}.`,
      )
    }
    levelId = level.id
  } else {
    levelId = useViewer.getState().selection.levelId as string | null
    if (!levelId && levels.length > 0) {
      levelId = levels[0]!.id
    }
  }

  if (!levelId || !nodes[levelId as AnyNodeId]) {
    return invalidInsert(
      'No target level available — create a building/level first (add_building) before inserting a preset.',
    )
  }

  const position: [number, number] = call.position ?? [0, 0]

  return {
    type: 'insert_room_preset',
    status: 'valid',
    presetId: matches[0]!.id,
    presetName: matches[0]!.name,
    levelId,
    position,
  }
}
