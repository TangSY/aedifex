/**
 * Public AI contracts surface — technical primitives only.
 *
 * No SaaS concepts (auth/quota/billing/rate-limit/MCP). Anything that
 * appears here must be meaningful on a standalone OSS deployment too.
 */
export {
  ALLOWED_CHAT_ROLES,
  AI_INPUT_LIMITS,
  validateChatRequest,
  describeChatRequestError,
} from './chat-request'
export type {
  AllowedChatRole,
  ChatMessageInput,
  ChatRequestBody,
  ChatRequestError,
} from './chat-request'
export type {
  AIRuntime,
  ChatTransport,
  CatalogProvider,
  CatalogResolveResult,
  ChatPersistence,
  AITelemetry,
  StreamCallbacks,
  StreamUsage,
  LoopExitReason,
  RoomPresetProvider,
  RoomPresetSummaryEntry,
} from './runtime'
