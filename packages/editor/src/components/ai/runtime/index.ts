/**
 * AIRuntime — module-level composition root.
 *
 * Why module-level instead of React Context: useAIChat is a Zustand
 * store created at module load (no Provider), so the runtime needs to
 * be readable from store action callbacks that fire outside the React
 * tree. A getter + setter pair is the simplest pattern that works.
 *
 * SaaS calls `setAIRuntime(saasRuntime)` once at the top of its
 * client-component tree (in editor-shell.tsx) before the chat panel
 * mounts. OSS deployments rely on `createDefaultAIRuntime()` being
 * read implicitly via `getAIRuntime()`.
 */

import type { AIRuntime, AITelemetry, RoomPresetProvider } from '../contracts/runtime'
import { createDefaultChatTransport } from './default-transport'
import { createDefaultCatalogProvider } from './default-catalog'
import { createDefaultChatPersistence } from './default-persistence'
import { createDefaultRoomPresetProvider } from './default-room-presets'

// Frozen no-op telemetry — same object reference so the 200-iteration
// agent loop's null-checks don't allocate on every step.
const NOOP_TELEMETRY: AITelemetry = Object.freeze({})

let currentRuntime: AIRuntime | null = null

export interface CreateDefaultRuntimeOptions {
  chatEndpoint?: string
  summarizeEndpoint?: string
}

export function createDefaultAIRuntime(
  options: CreateDefaultRuntimeOptions = {},
): AIRuntime {
  return {
    transport: createDefaultChatTransport({
      chatEndpoint: options.chatEndpoint,
      summarizeEndpoint: options.summarizeEndpoint,
    }),
    catalog: createDefaultCatalogProvider(),
    persistence: createDefaultChatPersistence(),
    telemetry: NOOP_TELEMETRY,
    roomPresets: createDefaultRoomPresetProvider(),
  }
}

// Shared fallback for runtimes installed without a roomPresets field
// (e.g. a host runtime built before the seam existed). Stateless, so a
// single module-level instance is safe to share.
const FALLBACK_ROOM_PRESETS = createDefaultRoomPresetProvider()

/**
 * Read the active RoomPresetProvider. Never returns undefined — when the
 * installed runtime omits `roomPresets`, the default "not available"
 * provider is returned so tool execution stays a straight line.
 */
export function getRoomPresetProvider(): RoomPresetProvider {
  return getAIRuntime().roomPresets ?? FALLBACK_ROOM_PRESETS
}

/**
 * Read the current AIRuntime. Falls back to a lazily-created default
 * if `setAIRuntime` was never called (OSS deployments).
 */
export function getAIRuntime(): AIRuntime {
  if (!currentRuntime) {
    currentRuntime = createDefaultAIRuntime()
  }
  return currentRuntime
}

/**
 * Replace the active runtime. SaaS calls this exactly once before the
 * chat panel mounts. Calling it again triggers a console warning so
 * accidental double-injection is visible during development.
 */
export function setAIRuntime(runtime: AIRuntime): void {
  if (currentRuntime && currentRuntime !== runtime) {
    console.warn(
      '[AIRuntime] Runtime replaced after initialization. This is usually a bug — runtimes should be installed once during app bootstrap.',
    )
  }
  currentRuntime = runtime
}

/**
 * Internal: reset the runtime to null so the next getAIRuntime() rebuilds
 * the default. Test-only — not exported from the public AI index.
 */
export function resetAIRuntimeForTesting(): void {
  currentRuntime = null
}
