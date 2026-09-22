// OPENAI_TOOLS intentionally NOT re-exported here — the schema is server-only
// (used by app/api/ai/chat/route.ts via the './ai/prompt' subpath). Keeping it
// out of the main index avoids bundling the full tool catalog into the client.
export { buildSystemPrompt, SUMMARIZE_SYSTEM_PROMPT } from './ai-prompt'
export {
  ALLOWED_CHAT_ROLES,
  AI_INPUT_LIMITS,
  validateChatRequest,
  describeChatRequestError,
} from './contracts'
export type {
  AllowedChatRole,
  ChatMessageInput,
  ChatRequestBody,
  ChatRequestError,
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
} from './contracts'
export {
  createDefaultAIRuntime,
  getAIRuntime,
  setAIRuntime,
  getRoomPresetProvider,
} from './runtime'
export {
  createDefaultRoomPresetProvider,
  formatRoomPresetSummary,
} from './runtime/default-room-presets'
export { executeRoomPresetToolCalls, isRoomPresetToolCall } from './ai-room-preset-executor'
export { AIChatPanel } from './ai-chat-panel'
export { useAIChat } from './ai-chat-store'
export { resolveCatalogSlug, generateCatalogSummary } from './ai-catalog-resolver'
export { serializeSceneContext } from './ai-scene-serializer'
export { validateAllToolCalls, buildToolResult } from './ai-mutation-executor'
export {
  runAgentLoop,
  confirmOperationsFromUI,
  rejectOperationsFromUI,
  answerPendingQuestion,
} from './ai-agent-loop'
export {
  applyGhostPreview,
  confirmGhostPreview,
  clearGhostPreview,
  isGhostPreviewActive,
} from './ai-preview-manager'
export { getPendingGhostRemovalIds } from './preview/ghost-node-helpers'
export {
  createProposals,
  switchToProposal,
  confirmActiveProposal,
  rejectAllProposals,
  isProposalModeActive,
} from './ai-proposal-manager'
export { getPlacementMeta, isAgainstWall, getAgainstWallCategories } from './furniture-placement-metadata'
export {
  getSceneOperations,
  resetSceneOperationsForTesting,
  type SceneOperations,
} from './scene-operations-adapter'
export {
  executeRemoteMcpToolCall,
  type RemoteMcpToolCall,
  type RemoteMcpToolResult,
} from './mcp-tool-router'
export { isComplexInstruction, generateExecutionPlan, buildPlanningContext } from './ai-planner'
export { findTemplate, detectBuildingRequest, generatePlanFromTemplate, getAvailableTemplates } from './building-templates'
export { analyzeRoom, formatRoomAnalysis } from './room-analyzer'
export type {
  AIToolCall,
  ChatMessage,
  ValidatedOperation,
  SceneContext,
  Proposal,
} from './types'
export type { FurniturePlacementMeta, PlacementType } from './furniture-placement-metadata'
export type { ExecutionPlan, PlanStep } from './ai-planner'
export type { BuildingTemplate, RoomTemplate } from './building-templates'
export type { RoomAnalysis, RoomType } from './room-analyzer'
