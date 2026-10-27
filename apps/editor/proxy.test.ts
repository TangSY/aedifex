import { afterEach, expect, test } from 'bun:test'
import { readdirSync } from 'node:fs'
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
import { issueSession, SESSION_COOKIE } from './lib/self-host-auth'
import { resolveUiLocale } from './lib/ui-locale'
import { config, gateRequest } from './proxy'

const OLD_ENV = { ...process.env }

afterEach(() => {
  for (const key of [
    'AEDIFEX_ADMIN_PASSWORD',
    'AEDIFEX_AUTH',
    'NODE_ENV',
    'AEDIFEX_SCENE_API_ALLOW_LOOPBACK_WITHOUT_TOKEN',
  ] as const) {
    if (OLD_ENV[key] === undefined) delete process.env[key]
    else process.env[key] = OLD_ENV[key]
  }
})

const request = (path: string, headers: Record<string, string> = {}) =>
  new Request(`https://aedifex.example${path}`, {
    headers: { host: 'aedifex.example', ...headers },
  })

test('an unconfigured network host sends pages to setup and APIs to 503', async () => {
  delete process.env.AEDIFEX_ADMIN_PASSWORD
  delete process.env.AEDIFEX_AUTH

  const page = gateRequest(request('/'))
  expect(page?.status).toBe(307)
  expect(page?.headers.get('location')).toBe('https://aedifex.example/setup')

  const api = gateRequest(request('/api/plugins/mint/session'))
  expect(api?.status).toBe(503)
  expect(await api?.json()).toEqual({ error: 'self_host_unconfigured' })
})

test('a password gates pages behind login and keeps the requested path', () => {
  process.env.AEDIFEX_ADMIN_PASSWORD = 'secret'

  const response = gateRequest(request('/project/abc?tab=build&lang=fr'))
  expect(response?.status).toBe(307)
  expect(response?.headers.get('location')).toBe(
    'https://aedifex.example/login?next=%2Fproject%2Fabc%3Ftab%3Dbuild%26lang%3Dfr',
  )
  expect(gateRequest(request('/api/plugins/mint/session'))?.status).toBe(401)
})

test('the home page sends a signed-out visitor to login without a next param', () => {
  process.env.AEDIFEX_ADMIN_PASSWORD = 'secret'
  const response = gateRequest(request('/'))
  expect(response?.status).toBe(307)
  expect(response?.headers.get('location')).toBe('https://aedifex.example/login')
})

test('a valid session passes', () => {
  process.env.AEDIFEX_ADMIN_PASSWORD = 'secret'
  const cookie = `${SESSION_COOKIE}=${issueSession()}`
  expect(gateRequest(request('/', { cookie }))).toBeNull()
  expect(gateRequest(request('/settings', { cookie }))).toBeNull()
  expect(gateRequest(request('/api/plugins/mint/session', { cookie }))).toBeNull()
})

test('public embed pages pass on a password-gated host without a session', () => {
  process.env.AEDIFEX_ADMIN_PASSWORD = 'secret'
  expect(gateRequest(request('/embed/abc'))).toBeNull()
  expect(gateRequest(request('/embed-other/abc'))?.status).toBe(307)
})

test('login, setup, health and the scene API are never gated here', () => {
  delete process.env.AEDIFEX_ADMIN_PASSWORD
  for (const path of ['/login', '/setup', '/api/health', '/api/scenes', '/api/artifacts/abc']) {
    expect(gateRequest(request(path))).toBeNull()
  }
})

test('the proxy runs on every page and API path, including dotted and locale-prefixed ones', () => {
  process.env.AEDIFEX_ADMIN_PASSWORD = 'secret'
  for (const path of [
    '/',
    '/project/abc',
    '/project/a.json',
    '/project/abc.d.e',
    '/api/x.json',
    '/api/plugins/mint/session',
    '/api/plugins/mint/api/x.json',
    '/fr/admin',
    '/en/api/x',
    '/en/project/a.json',
    '/fr/items/x.glb',
    '/settings',
  ]) {
    expect([path, unstable_doesMiddlewareMatch({ config, url: path })]).toEqual([path, true])
    expect([path, gateRequest(request(path))?.status]).not.toEqual([path, undefined])
  }
})

test('Next and public/ static assets skip the proxy', () => {
  for (const path of [
    '/_next/static/chunks/main.js',
    '/_next/static/media/font.woff2',
    '/_next/image?url=%2Fpascal.svg&w=64&q=75',
    '/favicon.ico',
    '/pascal-logo-shape.svg',
    '/audios/sfx/snapshot_capture.mp3',
    '/demos/demo_1.json',
    '/fonts/PlusJakartaSans-SemiBold.ttf',
    '/hdri/venice_sunset_1k.hdr',
    '/icons/column.webp',
    '/items/round-carpet/model.glb',
    '/material/concrete/prepared_drywall/prepared_drywall_normal_512.ktx2',
  ]) {
    expect([path, unstable_doesMiddlewareMatch({ config, url: path })]).toEqual([path, false])
  }
})

test('the proxy exclusion list stays aligned with public/ and app/ folders', () => {
  const topLevelFolders = (relativePath: string) =>
    readdirSync(new URL(relativePath, import.meta.url), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  const publicFolders = topLevelFolders('./public/')
  const appFolders = topLevelFolders('./app/')

  for (const folder of publicFolders) {
    const path = `/${folder}/__proxy-drift-check__`
    expect([folder, unstable_doesMiddlewareMatch({ config, url: path })]).toEqual([folder, false])
  }
  for (const folder of appFolders.filter((folder) => !publicFolders.includes(folder))) {
    const path = `/${folder}/__proxy-drift-check__`
    expect([folder, unstable_doesMiddlewareMatch({ config, url: path })]).toEqual([folder, true])
  }
})

test('loopback and an upstream proxy are open', () => {
  process.env.NODE_ENV = 'development'
  delete process.env.AEDIFEX_ADMIN_PASSWORD
  const loopback = new Request('http://localhost:3002/', {
    headers: { host: 'localhost:3002' },
  })
  expect(gateRequest(loopback)).toBeNull()
  process.env.AEDIFEX_AUTH = 'proxy'
  expect(gateRequest(request('/'))).toBeNull()
})

test('production pages and APIs refuse local-looking requests without runtime opt-in', () => {
  process.env.NODE_ENV = 'production'
  delete process.env.AEDIFEX_ADMIN_PASSWORD
  delete process.env.AEDIFEX_AUTH
  delete process.env.AEDIFEX_SCENE_API_ALLOW_LOOPBACK_WITHOUT_TOKEN
  const local = new Request('http://localhost:3002/', { headers: { host: 'localhost:3002' } })
  expect(gateRequest(local)?.headers.get('location')).toBe('http://localhost:3002/setup')
  expect(gateRequest(request('/api/ai/chat', { host: 'localhost' }))?.status).toBe(503)
  process.env.AEDIFEX_SCENE_API_ALLOW_LOOPBACK_WITHOUT_TOKEN = 'true'
  expect(gateRequest(local)).toBeNull()
  expect(gateRequest(request('/', { host: 'localhost' }))?.status).toBe(307)
})

test('a password gates an explicitly open production loopback runtime and proxy', () => {
  process.env.NODE_ENV = 'production'
  process.env.AEDIFEX_ADMIN_PASSWORD = 'secret'
  process.env.AEDIFEX_AUTH = 'proxy'
  process.env.AEDIFEX_SCENE_API_ALLOW_LOOPBACK_WITHOUT_TOKEN = '1'
  const local = new Request('http://localhost:3002/', { headers: { host: 'localhost:3002' } })
  expect(gateRequest(local)?.headers.get('location')).toBe('http://localhost:3002/login')
  expect(gateRequest(request('/api/ai/chat'))?.status).toBe(401)
})

test('UI locale canonicalization is deterministic for server rendering', () => {
  expect(resolveUiLocale('fr')).toBe('fr')
  expect(resolveUiLocale('zh-hans-cn')).toBe('zh-Hans-CN')
  expect(resolveUiLocale('')).toBe('en')
  expect(resolveUiLocale('not_a_locale')).toBe('en')
})
