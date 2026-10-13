/**
 * Chat request contract shared between OSS and SaaS chat routes.
 *
 * This file is the single source of truth for the wire format that the
 * AI chat panel sends to `/api/ai/chat`. Both the OSS reference route
 * (apps/editor) and the SaaS production route (aedifex-saas/apps/web)
 * import these constants and the validator, so the input contract can
 * never silently drift between deployments.
 *
 * No SaaS concepts (auth/quota/billing/rate-limit) belong here — those
 * stay in the SaaS route handler, layered on top of this validation.
 */

export const ALLOWED_CHAT_ROLES = ['user', 'assistant', 'tool'] as const
export type AllowedChatRole = (typeof ALLOWED_CHAT_ROLES)[number]

export const AI_INPUT_LIMITS = {
  MAX_MESSAGES: 100,
  MAX_MESSAGE_CONTENT: 64 * 1024,
  MAX_IMAGE_CONTENT: 8 * 1024 * 1024,
  MAX_MESSAGE_PARTS: 8,
  MAX_CATALOG_SUMMARY: 64 * 1024,
  MAX_SCENE_CONTEXT: 16 * 1024,
  MAX_ROOM_PRESET_SUMMARY: 16 * 1024,
} as const

export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } }

export type ChatContent = string | ChatContentPart[]

export function extractChatMessageText(content: ChatContent): string {
  return typeof content === 'string'
    ? content
    : content.map((part) => (part.type === 'text' ? part.text : '[Scene image]')).join('\n')
}

export interface ChatMessageInput {
  role: AllowedChatRole
  content: ChatContent
  tool_call_id?: string
}

export interface ChatRequestBody {
  messages: ChatMessageInput[]
  /**
   * Furniture/asset catalog summary injected into the system prompt.
   * Empty string is valid — OSS deployments without a registered catalog
   * still get the structural toolset (walls / doors / windows / etc.).
   */
  catalogSummary: string
  /**
   * Serialized scene state injected into the system prompt. Required —
   * an empty string is allowed for brand-new scenes but the field must
   * be present so the LLM can reason about "no scene yet".
   */
  sceneContext: string
  /**
   * User's saved room presets rendered as a single prompt line (e.g.
   * "User's saved room presets: 日式书房 (12 nodes), …"). Optional —
   * omitted/empty when the deployment has no preset backend or the
   * user has not saved any presets yet.
   */
  roomPresetSummary?: string
}

export type ChatRequestError =
  | 'INVALID_JSON'
  | 'MISSING_FIELDS'
  | 'INVALID_FORMAT'
  | 'INVALID_ROLE'
  | 'INVALID_TOOL_MESSAGE'
  | 'TOO_MANY_MESSAGES'
  | 'MESSAGE_TOO_LONG'
  | 'CATALOG_TOO_LONG'
  | 'CONTEXT_TOO_LONG'
  | 'PRESET_SUMMARY_TOO_LONG'

const CHAT_REQUEST_ERROR_MESSAGES: Record<ChatRequestError, string> = {
  INVALID_JSON: 'Invalid JSON body.',
  MISSING_FIELDS: 'Missing required fields.',
  INVALID_FORMAT: 'Invalid message format: content and role must be strings.',
  INVALID_ROLE: `Invalid message role. Allowed: ${ALLOWED_CHAT_ROLES.join(', ')}.`,
  INVALID_TOOL_MESSAGE: 'Tool messages must include a valid tool_call_id.',
  TOO_MANY_MESSAGES: `Message count exceeds limit of ${AI_INPUT_LIMITS.MAX_MESSAGES}.`,
  MESSAGE_TOO_LONG: `A message exceeds the maximum content length of ${AI_INPUT_LIMITS.MAX_MESSAGE_CONTENT} characters.`,
  CATALOG_TOO_LONG: `catalogSummary exceeds maximum length of ${AI_INPUT_LIMITS.MAX_CATALOG_SUMMARY} characters.`,
  CONTEXT_TOO_LONG: `sceneContext exceeds maximum length of ${AI_INPUT_LIMITS.MAX_SCENE_CONTEXT} characters.`,
  PRESET_SUMMARY_TOO_LONG: `roomPresetSummary exceeds maximum length of ${AI_INPUT_LIMITS.MAX_ROOM_PRESET_SUMMARY} characters.`,
}

export function describeChatRequestError(code: ChatRequestError): string {
  return CHAT_REQUEST_ERROR_MESSAGES[code]
}

export function validateChatMessageContent({
  role,
  content,
}: {
  role: string
  content: unknown
}): ChatRequestError | null {
  if (typeof content === 'string') {
    if (content.length > AI_INPUT_LIMITS.MAX_MESSAGE_CONTENT) return 'MESSAGE_TOO_LONG'
  } else {
    if (
      role !== 'user' ||
      !Array.isArray(content) ||
      !content.length ||
      content.length > AI_INPUT_LIMITS.MAX_MESSAGE_PARTS
    )
      return 'INVALID_FORMAT'
    let textLength = 0
    let imageLength = 0
    for (const part of content as ChatContentPart[]) {
      if (!part || typeof part !== 'object') return 'INVALID_FORMAT'
      if (part.type === 'text' && typeof part.text === 'string') textLength += part.text.length
      else if (
        part.type === 'image_url' &&
        part.image_url &&
        typeof part.image_url.url === 'string'
      ) {
        const { url, detail } = part.image_url
        if (url.length > AI_INPUT_LIMITS.MAX_IMAGE_CONTENT) return 'MESSAGE_TOO_LONG'
        if (
          !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(url) ||
          (detail !== undefined && !['auto', 'low', 'high'].includes(detail))
        )
          return 'INVALID_FORMAT'
        imageLength += url.length
      } else return 'INVALID_FORMAT'
    }
    if (
      textLength > AI_INPUT_LIMITS.MAX_MESSAGE_CONTENT ||
      imageLength > AI_INPUT_LIMITS.MAX_IMAGE_CONTENT
    )
      return 'MESSAGE_TOO_LONG'
  }
  return null
}

/**
 * Validate the raw JSON body of POST /api/ai/chat.
 *
 * - role whitelist (prevents client-side injection of the `system` role)
 * - tool messages must carry tool_call_id
 * - length limits per field
 * - catalogSummary may be empty string (OSS-friendly)
 */
export function validateChatRequest(
  body: unknown,
): { ok: true; value: ChatRequestBody } | { ok: false; error: ChatRequestError } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'INVALID_FORMAT' }
  }
  const b = body as Record<string, unknown>

  const messages = b.messages
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, error: 'MISSING_FIELDS' }
  }
  if (messages.length > AI_INPUT_LIMITS.MAX_MESSAGES) {
    return { ok: false, error: 'TOO_MANY_MESSAGES' }
  }

  let requestImageLength = 0
  for (const m of messages) {
    if (!m || typeof m !== 'object') {
      return { ok: false, error: 'INVALID_FORMAT' }
    }
    const msg = m as Partial<ChatMessageInput>
    if (typeof msg.role !== 'string') {
      return { ok: false, error: 'INVALID_FORMAT' }
    }
    if (!ALLOWED_CHAT_ROLES.includes(msg.role as AllowedChatRole)) {
      return { ok: false, error: 'INVALID_ROLE' }
    }
    if (msg.role === 'tool' && (typeof msg.tool_call_id !== 'string' || !msg.tool_call_id)) {
      return { ok: false, error: 'INVALID_TOOL_MESSAGE' }
    }
    const contentError = validateChatMessageContent({ role: msg.role, content: msg.content })
    if (contentError) return { ok: false, error: contentError }
    if (Array.isArray(msg.content)) {
      for (const part of msg.content)
        if (part.type === 'image_url') requestImageLength += part.image_url.url.length
      if (requestImageLength > AI_INPUT_LIMITS.MAX_IMAGE_CONTENT)
        return { ok: false, error: 'MESSAGE_TOO_LONG' }
    }
  }

  const catalogSummary = typeof b.catalogSummary === 'string' ? b.catalogSummary : ''
  const roomPresetSummary = typeof b.roomPresetSummary === 'string' ? b.roomPresetSummary : ''
  const sceneContext = b.sceneContext

  if (sceneContext === undefined || sceneContext === null) {
    return { ok: false, error: 'MISSING_FIELDS' }
  }
  if (typeof sceneContext !== 'string') {
    return { ok: false, error: 'INVALID_FORMAT' }
  }
  if (catalogSummary.length > AI_INPUT_LIMITS.MAX_CATALOG_SUMMARY) {
    return { ok: false, error: 'CATALOG_TOO_LONG' }
  }
  if (sceneContext.length > AI_INPUT_LIMITS.MAX_SCENE_CONTEXT) {
    return { ok: false, error: 'CONTEXT_TOO_LONG' }
  }
  if (roomPresetSummary.length > AI_INPUT_LIMITS.MAX_ROOM_PRESET_SUMMARY) {
    return { ok: false, error: 'PRESET_SUMMARY_TOO_LONG' }
  }

  return {
    ok: true,
    value: {
      messages: messages as ChatMessageInput[],
      catalogSummary,
      sceneContext,
      ...(roomPresetSummary ? { roomPresetSummary } : {}),
    },
  }
}
