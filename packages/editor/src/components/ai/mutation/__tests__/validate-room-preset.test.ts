/**
 * validateSaveRoomPreset / validateInsertRoomPreset boundary coverage.
 *
 * save_room_preset:
 *  - fuzzy zone-name matching (case-insensitive, bidirectional substring)
 *  - no zones in scene → invalid with guidance
 *  - no match → invalid listing available room names
 *  - multiple matches → invalid listing candidates (LLM should ask the user)
 *  - levelName narrowing (name match + numeric index match + not-found)
 *  - ghost preview zones are ignored
 *
 * insert_room_preset:
 *  - preset fuzzy matching against RoomPresetProvider.list()
 *  - empty preset list → invalid ("not saved any presets")
 *  - no match → invalid listing preset names
 *  - multiple matches → invalid listing candidates
 *  - level resolution: explicit levelName, active-level default, first-level
 *    fallback, no-level-at-all → invalid
 *  - position default [0, 0]
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RoomPresetSummaryEntry } from '../../contracts/runtime'

const mockNodes: Record<string, any> = {}
const mockSelectionLevelId = { value: null as string | null }
const mockPresetList = { value: [] as RoomPresetSummaryEntry[] }

vi.mock('@aedifex/core', () => ({
  useScene: { getState: () => ({ nodes: mockNodes }) },
}))

vi.mock('@aedifex/viewer', () => ({
  useViewer: { getState: () => ({ selection: { levelId: mockSelectionLevelId.value } }) },
}))

vi.mock('../../runtime', () => ({
  getRoomPresetProvider: () => ({
    list: () => mockPresetList.value,
    save: vi.fn(),
    insert: vi.fn(),
  }),
}))

import { validateInsertRoomPreset, validateSaveRoomPreset } from '../validate-room-preset'

function makeLevel(id: string, name: string, level: number) {
  mockNodes[id] = { id, type: 'level', name, level, visible: true, metadata: {}, parentId: 'building1', children: [] }
}

function makeZone(id: string, name: string, parentId: string, extra: Record<string, unknown> = {}) {
  mockNodes[id] = { id, type: 'zone', name, visible: true, metadata: {}, parentId, children: [], polygon: [[0, 0], [1, 0], [1, 1], [0, 1]], ...extra }
}

beforeEach(() => {
  for (const key of Object.keys(mockNodes)) delete mockNodes[key]
  mockSelectionLevelId.value = null
  mockPresetList.value = []
  mockNodes['building1'] = { id: 'building1', type: 'building', visible: true, metadata: {}, parentId: null, children: [] }
})

// ============================================================================
// validateSaveRoomPreset
// ============================================================================

describe('validateSaveRoomPreset', () => {
  it('resolves an exact zone name match', () => {
    makeLevel('level_1', 'Level 0', 0)
    makeZone('zone_1', 'Study', 'level_1')
    const result = validateSaveRoomPreset({ tool: 'save_room_preset', roomName: 'Study' })
    expect(result.status).toBe('valid')
    expect(result.zoneId).toBe('zone_1')
    expect(result.zoneName).toBe('Study')
  })

  it('matches case-insensitively and by substring (both directions)', () => {
    makeLevel('level_1', 'Level 0', 0)
    makeZone('zone_1', '日式书房', 'level_1')
    // query is substring of zone name
    expect(validateSaveRoomPreset({ tool: 'save_room_preset', roomName: '书房' }).status).toBe('valid')
    // zone name is substring of query
    expect(validateSaveRoomPreset({ tool: 'save_room_preset', roomName: '我的日式书房预设' }).status).toBe('valid')

    makeZone('zone_2', 'Master Bedroom', 'level_1')
    const r = validateSaveRoomPreset({ tool: 'save_room_preset', roomName: 'master bedroom' })
    expect(r.status).toBe('valid')
    expect(r.zoneId).toBe('zone_2')
  })

  it('rejects when the scene has no zones at all', () => {
    makeLevel('level_1', 'Level 0', 0)
    const result = validateSaveRoomPreset({ tool: 'save_room_preset', roomName: 'Study' })
    expect(result.status).toBe('invalid')
    expect(result.errorReason).toContain('no rooms')
  })

  it('rejects with available room names when nothing matches', () => {
    makeLevel('level_1', 'Level 0', 0)
    makeZone('zone_1', 'Kitchen', 'level_1')
    makeZone('zone_2', 'Bathroom', 'level_1')
    const result = validateSaveRoomPreset({ tool: 'save_room_preset', roomName: 'Garage' })
    expect(result.status).toBe('invalid')
    expect(result.errorReason).toContain('"Kitchen"')
    expect(result.errorReason).toContain('"Bathroom"')
  })

  it('rejects with candidate list when multiple zones match', () => {
    makeLevel('level_1', 'Level 0', 0)
    makeZone('zone_1', 'Bedroom 1', 'level_1')
    makeZone('zone_2', 'Bedroom 2', 'level_1')
    const result = validateSaveRoomPreset({ tool: 'save_room_preset', roomName: 'Bedroom' })
    expect(result.status).toBe('invalid')
    expect(result.errorReason).toContain('Multiple rooms match')
    expect(result.errorReason).toContain('"Bedroom 1"')
    expect(result.errorReason).toContain('"Bedroom 2"')
  })

  it('narrows the search with levelName (display-name match)', () => {
    makeLevel('level_1', 'Ground Floor', 0)
    makeLevel('level_2', 'Second Floor', 1)
    makeZone('zone_1', 'Bedroom', 'level_1')
    makeZone('zone_2', 'Bedroom', 'level_2')
    const result = validateSaveRoomPreset({
      tool: 'save_room_preset',
      roomName: 'Bedroom',
      levelName: 'Second Floor',
    })
    expect(result.status).toBe('valid')
    expect(result.zoneId).toBe('zone_2')
  })

  it('narrows the search with a numeric levelName (level index)', () => {
    makeLevel('level_1', '一层', 0)
    makeLevel('level_2', '二层', 1)
    makeZone('zone_1', 'Study', 'level_1')
    makeZone('zone_2', 'Study', 'level_2')
    const result = validateSaveRoomPreset({
      tool: 'save_room_preset',
      roomName: 'Study',
      levelName: '1',
    })
    expect(result.status).toBe('valid')
    expect(result.zoneId).toBe('zone_2') // level index 1 = 二层
  })

  it('rejects an unknown levelName and lists available levels', () => {
    makeLevel('level_1', 'Ground Floor', 0)
    makeZone('zone_1', 'Study', 'level_1')
    const result = validateSaveRoomPreset({
      tool: 'save_room_preset',
      roomName: 'Study',
      levelName: 'Penthouse',
    })
    expect(result.status).toBe('invalid')
    expect(result.errorReason).toContain('"Ground Floor"')
  })

  it('ignores ghost preview / hidden zones', () => {
    makeLevel('level_1', 'Level 0', 0)
    makeZone('zone_ghost', 'Study', 'level_1', { metadata: { isGhostPreview: true } })
    makeZone('zone_hidden', 'Study', 'level_1', { visible: false })
    const result = validateSaveRoomPreset({ tool: 'save_room_preset', roomName: 'Study' })
    expect(result.status).toBe('invalid')
    expect(result.errorReason).toContain('no rooms')
  })

  it('rejects empty roomName', () => {
    const result = validateSaveRoomPreset({ tool: 'save_room_preset', roomName: '  ' })
    expect(result.status).toBe('invalid')
    expect(result.errorReason).toContain('roomName is required')
  })
})

// ============================================================================
// validateInsertRoomPreset
// ============================================================================

describe('validateInsertRoomPreset', () => {
  const presets: RoomPresetSummaryEntry[] = [
    { id: 'preset_1', name: '日式书房', nodeCount: 12 },
    { id: 'preset_2', name: '主卧带衣帽间', nodeCount: 23 },
  ]

  it('resolves a preset by fuzzy name and defaults position to [0, 0]', () => {
    mockPresetList.value = presets
    makeLevel('level_1', 'Level 0', 0)
    mockSelectionLevelId.value = 'level_1'
    const result = validateInsertRoomPreset({ tool: 'insert_room_preset', presetName: '书房' })
    expect(result.status).toBe('valid')
    expect(result.presetId).toBe('preset_1')
    expect(result.presetName).toBe('日式书房')
    expect(result.levelId).toBe('level_1')
    expect(result.position).toEqual([0, 0])
  })

  it('keeps an explicit position', () => {
    mockPresetList.value = presets
    makeLevel('level_1', 'Level 0', 0)
    mockSelectionLevelId.value = 'level_1'
    const result = validateInsertRoomPreset({
      tool: 'insert_room_preset',
      presetName: '日式书房',
      position: [4, -2],
    })
    expect(result.status).toBe('valid')
    expect(result.position).toEqual([4, -2])
  })

  it('rejects when the user has no saved presets', () => {
    mockPresetList.value = []
    makeLevel('level_1', 'Level 0', 0)
    const result = validateInsertRoomPreset({ tool: 'insert_room_preset', presetName: '书房' })
    expect(result.status).toBe('invalid')
    expect(result.errorReason).toContain('not saved any room presets')
  })

  it('rejects with available preset names when nothing matches', () => {
    mockPresetList.value = presets
    makeLevel('level_1', 'Level 0', 0)
    const result = validateInsertRoomPreset({ tool: 'insert_room_preset', presetName: 'Garage' })
    expect(result.status).toBe('invalid')
    expect(result.errorReason).toContain('"日式书房"')
    expect(result.errorReason).toContain('"主卧带衣帽间"')
  })

  it('rejects with candidates when multiple presets match', () => {
    mockPresetList.value = [
      { id: 'p1', name: 'Bedroom Classic', nodeCount: 10 },
      { id: 'p2', name: 'Bedroom Modern', nodeCount: 11 },
    ]
    makeLevel('level_1', 'Level 0', 0)
    const result = validateInsertRoomPreset({ tool: 'insert_room_preset', presetName: 'Bedroom' })
    expect(result.status).toBe('invalid')
    expect(result.errorReason).toContain('Multiple presets match')
  })

  it('resolves an explicit levelName over the active selection', () => {
    mockPresetList.value = presets
    makeLevel('level_1', 'Ground Floor', 0)
    makeLevel('level_2', 'Second Floor', 1)
    mockSelectionLevelId.value = 'level_1'
    const result = validateInsertRoomPreset({
      tool: 'insert_room_preset',
      presetName: '日式书房',
      levelName: 'Second',
    })
    expect(result.status).toBe('valid')
    expect(result.levelId).toBe('level_2')
  })

  it('rejects an unknown levelName', () => {
    mockPresetList.value = presets
    makeLevel('level_1', 'Ground Floor', 0)
    const result = validateInsertRoomPreset({
      tool: 'insert_room_preset',
      presetName: '日式书房',
      levelName: 'Penthouse',
    })
    expect(result.status).toBe('invalid')
    expect(result.errorReason).toContain('not found')
  })

  it('falls back to the first level when nothing is selected', () => {
    mockPresetList.value = presets
    makeLevel('level_b', 'Upper', 1)
    makeLevel('level_a', 'Lower', 0)
    mockSelectionLevelId.value = null
    const result = validateInsertRoomPreset({ tool: 'insert_room_preset', presetName: '日式书房' })
    expect(result.status).toBe('valid')
    expect(result.levelId).toBe('level_a') // lowest level index wins
  })

  it('rejects when the scene has no levels at all', () => {
    mockPresetList.value = presets
    const result = validateInsertRoomPreset({ tool: 'insert_room_preset', presetName: '日式书房' })
    expect(result.status).toBe('invalid')
    expect(result.errorReason).toContain('No target level')
  })

  it('rejects empty presetName', () => {
    const result = validateInsertRoomPreset({ tool: 'insert_room_preset', presetName: '' })
    expect(result.status).toBe('invalid')
    expect(result.errorReason).toContain('presetName is required')
  })
})
