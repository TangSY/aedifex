import { describe, expect, test } from 'bun:test'
import { ASSETS_CDN_URL, resolveCdnUrl } from './asset-url'

describe('static material URLs', () => {
  test('resolves existing saved material paths to the shipped texture', () => {
    expect(resolveCdnUrl('/material/wood/woodplank_48/woodplank_48_basecolor_512.ktx2')).toBe(`${ASSETS_CDN_URL}/material/wood/woodplank_48/woodplank_48_BaseColor.webp`)
    expect(resolveCdnUrl(`${ASSETS_CDN_URL}/material/roofing/roof_tiles_terracotta/roof_tiles_terracotta_basecolor_512.ktx2`)).toBe(`${ASSETS_CDN_URL}/material/roofing/roof_tiles_terracotta/roof_tiles_terracotta_basecolor.webp`)
  })
  test('does not change unrelated external URLs', () => {
    expect(resolveCdnUrl('https://example.org/material/wood/woodplank_48/woodplank_48_basecolor_512.ktx2')).toBe('https://example.org/material/wood/woodplank_48/woodplank_48_basecolor_512.ktx2')
  })
})
