import { afterEach, expect, test } from 'bun:test'
import { GET } from './route'

const previous = process.env.AEDIFEX_ALLOWED_ASSET_ORIGINS

afterEach(() => {
  if (previous === undefined) delete process.env.AEDIFEX_ALLOWED_ASSET_ORIGINS
  else process.env.AEDIFEX_ALLOWED_ASSET_ORIGINS = previous
})

test('publishes only normalized origins without retaining credentials or paths', async () => {
  process.env.AEDIFEX_ALLOWED_ASSET_ORIGINS = 'https://user:secret@cdn.example/private?token=value'
  const response = GET()
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(await response.json()).toEqual({ origins: ['https://cdn.example'] })
})

test('reports invalid configured values as an empty restricted list', async () => {
  process.env.AEDIFEX_ALLOWED_ASSET_ORIGINS = 'invalid'
  expect(await GET().json()).toEqual({ origins: [] })
})
