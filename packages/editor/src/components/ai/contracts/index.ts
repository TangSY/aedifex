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
  extractChatMessageText,
  validateChatMessageContent,
} from './chat-request'
export type {
  AllowedChatRole,
  ChatMessageInput,
  ChatContent,
  ChatContentPart,
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

export { SUPPORTED_REMOTE_MCP_TOOL_NAMES } from './remote-tools'
export { SHARED_OPENAI_TOOLS, getSharedOpenAITools, sharedAgentContracts, isSharedAgentToolName } from './shared-agent-tools'
export type { SharedAgentToolName } from './shared-agent-tools'
