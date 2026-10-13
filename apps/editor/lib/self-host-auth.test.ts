import { expect, test } from 'bun:test'
import {
  issueSession,
  isLoopbackRequest,
  resolveAuthMode,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  sessionPrincipal,
  verifyPassword,
  verifySession,
} from './self-host-auth'

const publicRequest = (cookie?: string) =>
  new Request('https://aedifex.example/scenes', {
    headers: { host: 'aedifex.example', ...(cookie ? { cookie } : {}) },
  })

test('a loopback host is open without any configuration', () => {
  const request = new Request('http://aedifex.localhost:3002/', {
    headers: { host: 'aedifex.localhost:3002' },
  })
  expect(resolveAuthMode(request, {})).toBe('open')
})

test('a network host with nothing configured is refused', () => {
  expect(resolveAuthMode(publicRequest(), {})).toBe('unconfigured')
})

test('an upstream proxy can take over authentication explicitly', () => {
  expect(resolveAuthMode(publicRequest(), { AEDIFEX_AUTH: 'proxy' })).toBe('open')
})

test('a password requires a session even on loopback', () => {
  const request = new Request('http://localhost:3002/', { headers: { host: 'localhost:3002' } })
  expect(resolveAuthMode(request, { AEDIFEX_ADMIN_PASSWORD: 'secret' })).toBe('password')
})

test('a session issued for the password identifies the admin', () => {
  const env = { AEDIFEX_ADMIN_PASSWORD: 'secret' }
  const session = issueSession(env)
  expect(sessionPrincipal(publicRequest(`${SESSION_COOKIE}=${session}`), env)).toBe('admin')
  expect(sessionPrincipal(publicRequest(), env)).toBeNull()
})

test('changing the password signs every session out', () => {
  const session = issueSession({ AEDIFEX_ADMIN_PASSWORD: 'secret' })
  expect(verifySession(session, { AEDIFEX_ADMIN_PASSWORD: 'rotated' })).toBe(false)
})

test('a session expires after its lifetime and never validates from the future', () => {
  const env = { AEDIFEX_ADMIN_PASSWORD: 'secret' }
  const issued = Date.UTC(2026, 9, 12)
  const session = issueSession(env, issued)
  expect(verifySession(session, env, issued + (SESSION_TTL_SECONDS - 1) * 1000)).toBe(true)
  expect(verifySession(session, env, issued + (SESSION_TTL_SECONDS + 1) * 1000)).toBe(false)
  expect(verifySession(session, env, issued - 1000)).toBe(false)
})

test('a tampered session is rejected', () => {
  const env = { AEDIFEX_ADMIN_PASSWORD: 'secret' }
  const [version, issuedAt, signature] = issueSession(env).split('.')
  expect(verifySession(`${version}.${Number(issuedAt) + 1}.${signature}`, env)).toBe(false)
  expect(verifySession('garbage', env)).toBe(false)
})

test('password verification is exact and fails closed without a password', () => {
  expect(verifyPassword('secret', { AEDIFEX_ADMIN_PASSWORD: 'secret' })).toBe(true)
  expect(verifyPassword('Secret', { AEDIFEX_ADMIN_PASSWORD: 'secret' })).toBe(false)
  expect(verifyPassword('', {})).toBe(false)
})

const localRequest = () =>
  new Request('http://aedifex.localhost:3002/', { headers: { host: 'aedifex.localhost:3002' } })

test('production loopback is closed unless the runtime explicitly opts in', () => {
  for (const flag of [undefined, '', '0', 'false']) {
    expect(
      resolveAuthMode(localRequest(), {
        NODE_ENV: 'production',
        AEDIFEX_SCENE_API_ALLOW_LOOPBACK_WITHOUT_TOKEN: flag,
      }),
    ).toBe('unconfigured')
  }
  for (const flag of ['1', 'true', 'TRUE']) {
    expect(
      resolveAuthMode(localRequest(), {
        NODE_ENV: 'production',
        AEDIFEX_SCENE_API_ALLOW_LOOPBACK_WITHOUT_TOKEN: flag,
      }),
    ).toBe('open')
  }
})

test('a forged local Host cannot open a network URL, even with loopback opt-in', () => {
  const forged = new Request('https://aedifex.example/', { headers: { host: 'localhost' } })
  expect(isLoopbackRequest(forged)).toBe(false)
  expect(resolveAuthMode(forged, { NODE_ENV: 'development' })).toBe('unconfigured')
  expect(
    resolveAuthMode(forged, {
      NODE_ENV: 'production',
      AEDIFEX_SCENE_API_ALLOW_LOOPBACK_WITHOUT_TOKEN: 'true',
    }),
  ).toBe('unconfigured')
  expect(
    isLoopbackRequest(
      new Request('http://127.0.0.1/', {
        headers: { host: 'aedifex.example' },
      }),
    ),
  ).toBe(false)
})

test('a configured password wins over production loopback opt-in and proxy mode', () => {
  expect(
    resolveAuthMode(localRequest(), {
      NODE_ENV: 'production',
      AEDIFEX_ADMIN_PASSWORD: 'secret',
      AEDIFEX_AUTH: 'proxy',
      AEDIFEX_SCENE_API_ALLOW_LOOPBACK_WITHOUT_TOKEN: '1',
    }),
  ).toBe('password')
})

test('explicitly configured proxy authentication still opens a production network host', () => {
  expect(
    resolveAuthMode(publicRequest(), {
      NODE_ENV: 'production',
      AEDIFEX_AUTH: 'proxy',
    }),
  ).toBe('open')
})

test('IPv6 loopback request names are recognized consistently', () => {
  expect(
    isLoopbackRequest(
      new Request('http://[::1]:3002/', {
        headers: { host: '[::1]:3002' },
      }),
    ),
  ).toBe(true)
})
