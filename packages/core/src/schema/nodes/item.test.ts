import { describe, expect, test } from 'bun:test'
import { ItemNode } from './item'

// Minimum required asset payload to satisfy assetSchema
function makeAsset(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'asset-1',
    category: 'chair',
    name: 'Chair',
    thumbnail: 'asset://thumbs/chair.png',
    src: 'asset://catalog/items/chair-1',
    ...overrides,
  }
}

function makeItem(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'item_abc',
    type: 'item',
    parentId: null,
    asset: makeAsset(),
    ...overrides,
  }
}

describe('ItemNode — asset.src URL refine (security guard)', () => {
  test('accepts asset:// internal handles', () => {
    const r = ItemNode.safeParse(makeItem({ asset: makeAsset({ src: 'asset://item/foo' }) }))
    expect(r.success).toBe(true)
  })

  test('accepts https:// CDN URLs', () => {
    const r = ItemNode.safeParse(
      makeItem({ asset: makeAsset({ src: 'https://cdn.example.com/x.glb' }) }),
    )
    expect(r.success).toBe(true)
  })

  test('REJECTS javascript: URLs (XSS / beacon vector)', () => {
    const r = ItemNode.safeParse(
      makeItem({ asset: makeAsset({ src: 'javascript:alert(1)' }) }),
    )
    expect(r.success).toBe(false)
  })

  test('REJECTS javascript: URLs even with uppercase scheme', () => {
    const r = ItemNode.safeParse(
      makeItem({ asset: makeAsset({ src: 'JAVASCRIPT:alert(1)' }) }),
    )
    expect(r.success).toBe(false)
  })

  test('REJECTS file:///etc/passwd', () => {
    const r = ItemNode.safeParse(
      makeItem({ asset: makeAsset({ src: 'file:///etc/passwd' }) }),
    )
    expect(r.success).toBe(false)
  })

  test('REJECTS data:text/html (HTML injection)', () => {
    const r = ItemNode.safeParse(
      makeItem({
        asset: makeAsset({ src: 'data:text/html,<script>alert(1)</script>' }),
      }),
    )
    expect(r.success).toBe(false)
  })

  test('REJECTS http://evil.com (non-loopback http)', () => {
    const r = ItemNode.safeParse(
      makeItem({ asset: makeAsset({ src: 'http://evil.com/x.glb' }) }),
    )
    expect(r.success).toBe(false)
  })

  test('REJECTS http://169.254.169.254 (cloud metadata SSRF)', () => {
    const r = ItemNode.safeParse(
      makeItem({
        asset: makeAsset({ src: 'http://169.254.169.254/latest/meta-data/' }),
      }),
    )
    expect(r.success).toBe(false)
  })
})

describe('ItemNode — default values', () => {
  test('asset.dimensions defaults to [1, 1, 1]', () => {
    const r = ItemNode.parse(makeItem())
    expect(r.asset.dimensions).toEqual([1, 1, 1])
  })

  test('asset.scale defaults to [1, 1, 1]', () => {
    const r = ItemNode.parse(makeItem())
    expect(r.asset.scale).toEqual([1, 1, 1])
  })

  test('asset.source defaults to "library"', () => {
    const r = ItemNode.parse(makeItem())
    expect(r.asset.source).toBe('library')
  })

  test('top-level position/rotation/scale default to identity', () => {
    const r = ItemNode.parse(makeItem())
    expect(r.position).toEqual([0, 0, 0])
    expect(r.rotation).toEqual([0, 0, 0])
    expect(r.scale).toEqual([1, 1, 1])
  })
})
