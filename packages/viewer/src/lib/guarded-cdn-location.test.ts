import { expect, test } from 'bun:test'
import { AssetAccessError } from '@aedifex/core'
import { ASSETS_CDN_URL, resolveCdnUrl } from './asset-url'
import { guardedCdnLocation } from './guarded-cdn-location'

const documentUrl = 'https://app.example/editor'

test('preserves trusted catalog paths while rejecting origin changes', () => {
  const source = '/materials/stone.png'
  const resolvedUrl = resolveCdnUrl(source)!
  const location = guardedCdnLocation({ source, resolvedUrl, documentUrl })
  expect(location.trustedRelativeOrigin).toBe(new URL(ASSETS_CDN_URL).origin)
  expect(new URL(location.source, location.baseUrl).href).toBe(resolvedUrl)
  expect(() =>
    guardedCdnLocation({ source: '//other.example/x', resolvedUrl, documentUrl }),
  ).toThrow(AssetAccessError)
  expect(() =>
    guardedCdnLocation({
      source: 'https://allowed.example/x',
      resolvedUrl: 'https://other.example/x',
      documentUrl,
    }),
  ).toThrow(AssetAccessError)
  expect(() =>
    guardedCdnLocation({ source: 'https://[invalid', resolvedUrl, documentUrl }),
  ).toThrow(AssetAccessError)
})
