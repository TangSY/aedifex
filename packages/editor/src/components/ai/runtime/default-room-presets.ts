import type {
  RoomPresetProvider,
  RoomPresetSummaryEntry,
} from '../contracts/runtime'

/**
 * Default RoomPresetProvider for OSS deployments.
 *
 * Room presets need a storage backend (serialization, listing, quota),
 * which the standalone OSS editor does not ship. The default provider
 * therefore reports an empty preset list and politely declines save/insert
 * — the message string flows back to the LLM verbatim so the user gets a
 * clear "not available here" answer instead of a silent failure.
 *
 * Host deployments override this by setting `roomPresets` on the runtime
 * passed to `setAIRuntime`.
 */
const UNAVAILABLE_MESSAGE = 'Room presets are not available in this deployment.'

export function createDefaultRoomPresetProvider(): RoomPresetProvider {
  return {
    list: () => [],
    save: async () => ({ ok: false, message: UNAVAILABLE_MESSAGE }),
    insert: async () => ({ ok: false, message: UNAVAILABLE_MESSAGE }),
  }
}

/**
 * Render the preset list as a single prompt-injection line, e.g.
 * `User's saved room presets: 日式书房 (12 nodes), 主卧带衣帽间 (23 nodes)`.
 * Returns the empty string for an empty list — callers skip injection.
 */
export function formatRoomPresetSummary(entries: RoomPresetSummaryEntry[]): string {
  if (entries.length === 0) return ''
  const parts = entries.map((e) => `${e.name} (${e.nodeCount} nodes)`)
  return `User's saved room presets: ${parts.join(', ')}`
}
