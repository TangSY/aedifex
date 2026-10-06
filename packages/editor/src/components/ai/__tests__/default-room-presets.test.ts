/**
 * Default RoomPresetProvider + prompt summary formatting.
 *
 * The OSS deployment has no preset backend: list() must be empty and
 * save/insert must decline with a stable, user-relayable message. The
 * summary formatter feeds the system prompt — empty list must produce
 * the empty string so no prompt section is injected.
 */
import { describe, expect, it } from 'vitest'
import {
  createDefaultRoomPresetProvider,
  formatRoomPresetSummary,
} from '../runtime/default-room-presets'

describe('createDefaultRoomPresetProvider', () => {
  it('lists no presets', () => {
    expect(createDefaultRoomPresetProvider().list()).toEqual([])
  })

  it('declines save with an explanatory message', async () => {
    const result = await createDefaultRoomPresetProvider().save('zone_1', 'Study')
    expect(result.ok).toBe(false)
    expect(result.message).toBe('Room presets are not available in this deployment.')
    expect(result.presetId).toBeUndefined()
  })

  it('declines insert with an explanatory message', async () => {
    const result = await createDefaultRoomPresetProvider().insert('preset_1', {
      levelId: 'level_1',
      position: [0, 0],
    })
    expect(result.ok).toBe(false)
    expect(result.message).toBe('Room presets are not available in this deployment.')
    expect(result.rootIds).toBeUndefined()
  })
})

describe('formatRoomPresetSummary', () => {
  it('returns the empty string for an empty list (no prompt injection)', () => {
    expect(formatRoomPresetSummary([])).toBe('')
  })

  it('renders one line with names and node counts', () => {
    const summary = formatRoomPresetSummary([
      { id: 'p1', name: '日式书房', nodeCount: 12 },
      { id: 'p2', name: '主卧带衣帽间', nodeCount: 23 },
    ])
    expect(summary).toBe(
      "User's saved room presets: 日式书房 (12 nodes), 主卧带衣帽间 (23 nodes)",
    )
  })
})
