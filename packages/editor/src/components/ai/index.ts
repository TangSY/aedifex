export { buildSystemPrompt, OPENAI_TOOLS, SUMMARIZE_SYSTEM_PROMPT } from './ai-prompt'
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
export {
  createProposals,
  switchToProposal,
  confirmActiveProposal,
  rejectAllProposals,
  isProposalModeActive,
} from './ai-proposal-manager'
export { getPlacementMeta, isAgainstWall, getAgainstWallCategories } from './furniture-placement-metadata'
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
export type { BuildingTemplate, RoomTemplate } from './building-templates'
export type { RoomAnalysis, RoomType } from './room-analyzer'
