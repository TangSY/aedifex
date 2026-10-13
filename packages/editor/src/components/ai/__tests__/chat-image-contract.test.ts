import { describe, expect, it } from 'vitest'
import {
  extractChatMessageText,
  validateChatMessageContent,
  validateChatRequest,
} from '../contracts/chat-request'

const image = {
  type: 'image_url',
  image_url: { url: 'data:image/png;base64,YQ==', detail: 'high' },
} as const

describe('scene images in the existing chat request', () => {
  it('accepts a user image and text while preserving string-only callers', () => {
    expect(
      validateChatRequest({
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Compare the scene' }, image] }],
        sceneContext: '',
        catalogSummary: '',
      }).ok,
    ).toBe(true)
    expect(
      validateChatRequest({
        messages: [{ role: 'user', content: 'Build a room' }],
        sceneContext: '',
      }).ok,
    ).toBe(true)
    expect(extractChatMessageText([{ type: 'text', text: 'Compare' }, image])).toBe(
      'Compare\n[Scene image]',
    )
  })

  it('rejects image injection in assistant/tool messages and remote image requests', () => {
    for (const role of ['tool', 'assistant'])
      expect(validateChatMessageContent({ role, content: [image] })).toBe('INVALID_FORMAT')
    expect(
      validateChatMessageContent({
        role: 'user',
        content: [{ type: 'image_url', image_url: { url: 'https://private.example/image.png' } }],
      }),
    ).toBe('INVALID_FORMAT')
    expect(
      validateChatMessageContent({
        role: 'user',
        content: [{ type: 'image_url', image_url: { url: 'data:image/svg+xml;base64,YQ==' } }],
      }),
    ).toBe('INVALID_FORMAT')
  })

  it('bounds parts and cumulative text independently of image bytes', () => {
    expect(validateChatMessageContent({ role: 'user', content: Array(9).fill(image) })).toBe(
      'INVALID_FORMAT',
    )
    expect(
      validateChatMessageContent({
        role: 'user',
        content: [{ type: 'text', text: 'x'.repeat(65537) }],
      }),
    ).toBe('MESSAGE_TOO_LONG')
    expect(validateChatMessageContent({ role: 'user', content: [] })).toBe('INVALID_FORMAT')
  })

  it('applies one image budget to the whole request, including images in separate messages', () => {
    const large = {
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${'A'.repeat(4 * 1024 * 1024)}` },
    }
    expect(
      validateChatRequest({
        messages: [
          { role: 'user', content: [large] },
          { role: 'user', content: [large] },
        ],
        sceneContext: '',
      }),
    ).toMatchObject({ ok: false, error: 'MESSAGE_TOO_LONG' })
  })
})
