import { afterEach, expect, test } from 'bun:test'
import { guardSceneApiRequest, sceneApiPreflight } from './scene-api-security'
import { issueSession, SESSION_COOKIE } from './self-host-auth'

const OLD_ENV = { ...process.env }

afterEach(() => {
  restoreEnv('AEDIFEX_ADMIN_PASSWORD')
  restoreEnv('AEDIFEX_AUTH')
  restoreEnv('AEDIFEX_SCENE_API_TOKEN')
  restoreEnv('AEDIFEX_SCENE_API_ORIGINS')
  restoreEnv('AEDIFEX_PUBLIC_URL')
  restoreEnv('AEDIFEX_SCENE_API_RATE_LIMIT')
  restoreEnv('AEDIFEX_SCENE_API_ALLOW_LOOPBACK_WITHOUT_TOKEN')
  restoreEnv('NODE_ENV')
})

function restoreEnv(key: keyof NodeJS.ProcessEnv): void {
  if (OLD_ENV[key] === undefined) delete process.env[key]
  else process.env[key] = OLD_ENV[key]
}

test('allows loopback scene API requests without a token', () => {
  delete process.env.AEDIFEX_SCENE_API_TOKEN
  process.env.NODE_ENV = 'development'
  const request = new Request('http://127.0.0.1:3000/api/scenes', {
    headers: { host: '127.0.0.1:3000' },
  })

  expect(guardSceneApiRequest(request)).toBeNull()
})

test('requires explicit loopback opt-in for production without a token', async () => {
  delete process.env.AEDIFEX_SCENE_API_TOKEN
  delete process.env.AEDIFEX_SCENE_API_ALLOW_LOOPBACK_WITHOUT_TOKEN
  process.env.NODE_ENV = 'production'
  const request = new Request('http://127.0.0.1:3000/api/scenes', {
    headers: { host: '127.0.0.1:3000' },
  })

  const response = guardSceneApiRequest(request)

  expect(response?.status).toBe(503)
})

test('allows explicit production loopback opt-in for loopback-bound runtimes', () => {
  delete process.env.AEDIFEX_SCENE_API_TOKEN
  process.env.NODE_ENV = 'production'
  process.env.AEDIFEX_SCENE_API_ALLOW_LOOPBACK_WITHOUT_TOKEN = 'true'
  const request = new Request('http://127.0.0.1:3000/api/scenes', {
    headers: { host: '127.0.0.1:3000' },
  })

  expect(guardSceneApiRequest(request)).toBeNull()
})

test('requires a token for non-loopback scene API requests', async () => {
  delete process.env.AEDIFEX_SCENE_API_TOKEN
  const request = new Request('https://editor.example/api/scenes', {
    headers: { host: 'editor.example' },
  })

  const response = guardSceneApiRequest(request)

  expect(response?.status).toBe(503)
  expect(await response?.json()).toEqual({ error: 'scene_api_token_required' })
})

test('accepts the admin session on a password-protected host', () => {
  process.env.AEDIFEX_ADMIN_PASSWORD = 'secret'
  delete process.env.AEDIFEX_SCENE_API_TOKEN
  const signedIn = new Request('https://editor.example/api/scenes', {
    headers: { host: 'editor.example', cookie: `${SESSION_COOKIE}=${issueSession()}` },
  })
  const anonymous = new Request('https://editor.example/api/scenes', {
    headers: { host: 'editor.example' },
  })

  expect(guardSceneApiRequest(signedIn)).toBeNull()
  expect(guardSceneApiRequest(anonymous)?.status).toBe(401)
})

test('an upstream proxy opens the scene API without a token', () => {
  process.env.AEDIFEX_AUTH = 'proxy'
  delete process.env.AEDIFEX_SCENE_API_TOKEN
  const request = new Request('https://editor.example/api/scenes', {
    headers: { host: 'editor.example' },
  })

  expect(guardSceneApiRequest(request)).toBeNull()
})

test('accepts bearer token auth when configured', () => {
  process.env.AEDIFEX_SCENE_API_TOKEN = 'secret'
  const request = new Request('https://editor.example/api/scenes', {
    headers: {
      authorization: 'Bearer secret',
      host: 'editor.example',
    },
  })

  expect(guardSceneApiRequest(request)).toBeNull()
})

test('applies configured CORS origins for preflight', () => {
  process.env.AEDIFEX_SCENE_API_ORIGINS = 'https://app.example'
  const request = new Request('https://editor.example/api/scenes', {
    method: 'OPTIONS',
    headers: {
      host: 'editor.example',
      origin: 'https://app.example',
    },
  })

  const response = sceneApiPreflight(request)

  expect(response.status).toBe(204)
  expect(response.headers.get('access-control-allow-origin')).toBe('https://app.example')
})

test('rejects cross-port loopback origins unless explicitly configured', () => {
  const request = new Request('http://127.0.0.1:3000/api/scenes', {
    method: 'OPTIONS',
    headers: {
      host: '127.0.0.1:3000',
      origin: 'http://localhost:5173',
    },
  })

  expect(sceneApiPreflight(request).status).toBe(403)
})

function originGuard(input: { url?: string; host?: string; origin: string; forwarded?: string }) {
  delete process.env.AEDIFEX_SCENE_API_ORIGINS
  return guardSceneApiRequest(
    new Request(input.url ?? 'http://localhost:3107/api/scenes', {
      method: 'POST',
      headers: {
        ...(input.host ? { host: input.host } : {}),
        origin: input.origin,
        ...(input.forwarded
          ? {
              'x-forwarded-host': input.forwarded,
              'x-forwarded-proto': 'https',
            }
          : {}),
      },
    }),
    { skipAuth: true, skipRateLimit: true },
  )
}

test('compares a Next-normalized loopback URL with its exact external Host', () => {
  delete process.env.AEDIFEX_PUBLIC_URL
  for (const host of ['127.0.0.1:3107', 'localhost:3107', '[::1]:3107']) {
    expect(originGuard({ host, origin: `http://${host}` })).toBeNull()
  }
})

test('loopback aliases and ports are distinct browser origins', () => {
  delete process.env.AEDIFEX_PUBLIC_URL
  for (const [host, origin] of [
    ['127.0.0.1:3107', 'http://localhost:3107'],
    ['localhost:3107', 'http://127.0.0.1:3107'],
    ['127.0.0.1:3107', 'http://127.0.0.1:3108'],
    ['127.0.0.1:3107', 'https://127.0.0.1:3107'],
  ])
    expect(originGuard({ host, origin: origin! })?.status).toBe(403)
})

test('rejects a Host that disagrees with the browser origin and malformed Host authorities', () => {
  delete process.env.AEDIFEX_PUBLIC_URL
  for (const host of [
    'evil.example:3107',
    '127.0.0.1:3107@evil.example',
    '127.0.0.1:3107/evil',
    '127.0.0.1:3107,evil.example',
    '127.0.0.1:99999',
    '127.0.0.1:3107\\evil.example',
  ])
    expect(originGuard({ host, origin: 'http://127.0.0.1:3107' })?.status).toBe(403)
})

test('uses a configured public URL as the authority and ignores forged forwarding headers', () => {
  process.env.AEDIFEX_PUBLIC_URL = 'https://editor.example'
  expect(originGuard({ host: 'localhost:3107', origin: 'https://editor.example' })).toBeNull()
  expect(originGuard({ host: 'evil.example', origin: 'https://evil.example' })?.status).toBe(403)
  expect(originGuard({ host: 'localhost:3107', origin: 'http://localhost:3107' })?.status).toBe(403)
  delete process.env.AEDIFEX_PUBLIC_URL
  expect(
    originGuard({
      host: '127.0.0.1:3107',
      origin: 'https://evil.example',
      forwarded: 'evil.example',
    })?.status,
  ).toBe(403)
})

test('same-origin checks refuse credentialed and path-bearing Origin values', () => {
  delete process.env.AEDIFEX_PUBLIC_URL
  for (const origin of ['http://user@127.0.0.1:3107', 'http://127.0.0.1:3107/path']) {
    expect(originGuard({ host: '127.0.0.1:3107', origin })?.status).toBe(403)
  }
})
