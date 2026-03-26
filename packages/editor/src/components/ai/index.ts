export { AIChatPanel } from './ai-chat-panel'
export { useAIChat } from './ai-chat-store'
export { resolveCatalogSlug, generateCatalogSummary } from './ai-catalog-resolver'
export { serializeSceneContext } from './ai-scene-serializer'
export { validateAllToolCalls } from './ai-mutation-executor'
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
export type {
  AIToolCall,
  ChatMessage,
  ValidatedOperation,
  SceneContext,
  Proposal,
} from './types'
