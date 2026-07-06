import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SceneBridge } from '../bridge/scene-bridge'
import { createAedifexMcpServer } from '../server'
import { connectHttp, type HttpTransportHandle } from './http'

// Helper to POST a JSON-RPC payload to the /mcp endpoint without using the SDK
// transport, so we can probe security middleware directly.
async function postMcp(
  port: number,
  body: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  })
}

let bridge: SceneBridge
let server: McpServer
let handle: HttpTransportHandle | null = null

beforeEach(() => {
  bridge = new SceneBridge()
  bridge.loadDefault()
  server = createAedifexMcpServer({ bridge })
})

afterEach(async () => {
  if (handle) {
    await handle.close()
    handle = null
  }
})

describe('http guard — rate limiting', () => {
  test('returns 429 with Retry-After header after exceeding rateLimitPerMinute', async () => {
    handle = await connectHttp(server, 0, {
      authToken: 'secret',
      rateLimitPerMinute: 3,
    })

    // First 3 requests should pass auth (and reach MCP) — they'll return non-429.
    for (let i = 0; i < 3; i++) {
      const ok = await postMcp(handle.port, '{}', { authorization: 'Bearer secret' })
      expect(ok.status).not.toBe(429)
      // Body must be drained so the keep-alive socket can be reused.
      await ok.text()
    }

    // Fourth request within the window must be rate-limited.
    const limited = await postMcp(handle.port, '{}', { authorization: 'Bearer secret' })
    expect(limited.status).toBe(429)
    const retryAfter = limited.headers.get('retry-after')
    expect(retryAfter).not.toBeNull()
    // Retry-After is a positive integer seconds value.
    expect(Number(retryAfter)).toBeGreaterThanOrEqual(1)
    const payload = (await limited.json()) as { error: string }
    expect(payload.error).toBe('rate_limited')
  })

  test('rateLimitPerMinute=0 disables the limiter (no 429)', async () => {
    handle = await connectHttp(server, 0, {
      authToken: 'secret',
      rateLimitPerMinute: 0,
    })

    for (let i = 0; i < 5; i++) {
      const res = await postMcp(handle.port, '{}', { authorization: 'Bearer secret' })
      expect(res.status).not.toBe(429)
      await res.text()
    }
  })
})

describe('http guard — origin allowlist', () => {
  test('returns 403 origin_not_allowed for a disallowed Origin header', async () => {
    handle = await connectHttp(server, 0, {
      authToken: 'secret',
      allowedOrigins: ['https://app.example'],
    })

    const res = await fetch(`http://127.0.0.1:${handle.port}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://evil.example',
        authorization: 'Bearer secret',
      },
      body: '{}',
    })
    expect(res.status).toBe(403)
    // CORS headers must NOT have been applied since origin check ran first.
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
    const payload = (await res.json()) as { error: string }
    expect(payload.error).toBe('origin_not_allowed')
  })

  test('cross-port loopback origins are rejected by default (CSRF hardening)', async () => {
    // Previous behavior: any loopback origin was accepted. That let a
    // malicious page on http://localhost:<other-port> mount CSRF against
    // an MCP server. Default is now strict — cross-port loopback is
    // treated the same as any other unlisted origin.
    handle = await connectHttp(server, 0, { authToken: 'secret' })

    const res = await fetch(`http://127.0.0.1:${handle.port}/mcp`, {
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'POST',
      },
    })
    expect(res.status).toBe(403)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  test('cross-port loopback allowed when opted in via AEDIFEX_MCP_HTTP_LOOPBACK_ANY_ORIGIN', async () => {
    const previous = process.env.AEDIFEX_MCP_HTTP_LOOPBACK_ANY_ORIGIN
    process.env.AEDIFEX_MCP_HTTP_LOOPBACK_ANY_ORIGIN = 'true'
    try {
      handle = await connectHttp(server, 0, { authToken: 'secret' })
      const res = await fetch(`http://127.0.0.1:${handle.port}/mcp`, {
        method: 'OPTIONS',
        headers: {
          origin: 'http://localhost:5173',
          'access-control-request-method': 'POST',
        },
      })
      expect(res.status).toBe(204)
      expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
    } finally {
      if (previous === undefined) delete process.env.AEDIFEX_MCP_HTTP_LOOPBACK_ANY_ORIGIN
      else process.env.AEDIFEX_MCP_HTTP_LOOPBACK_ANY_ORIGIN = previous
    }
  })

  test('cross-port loopback allowed when listed in allowedOrigins', async () => {
    handle = await connectHttp(server, 0, {
      authToken: 'secret',
      allowedOrigins: ['http://localhost:5173'],
    })
    const res = await fetch(`http://127.0.0.1:${handle.port}/mcp`, {
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'POST',
      },
    })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
  })

  test('OPTIONS preflight from a disallowed origin still returns 403 (origin check precedes preflight)', async () => {
    handle = await connectHttp(server, 0, {
      authToken: 'secret',
      allowedOrigins: ['https://app.example'],
    })
    const res = await fetch(`http://127.0.0.1:${handle.port}/mcp`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://evil.example',
        'access-control-request-method': 'POST',
      },
    })
    expect(res.status).toBe(403)
  })
})

describe('http guard — authentication', () => {
  test('returns 401 when authorization header is a wrong-length bearer (safeEqual short-circuit)', async () => {
    // Token "secret" is 6 bytes; supplied "x" is 1 byte. safeEqual must return
    // false WITHOUT calling timingSafeEqual (which would throw on length mismatch).
    handle = await connectHttp(server, 0, { authToken: 'secret' })

    const res = await postMcp(handle.port, '{}', { authorization: 'Bearer x' })
    expect(res.status).toBe(401)
    const payload = (await res.json()) as { error: string }
    expect(payload.error).toBe('unauthorized')
  })

  test('returns 401 when bearer scheme is missing (raw token in authorization header)', async () => {
    handle = await connectHttp(server, 0, { authToken: 'secret' })
    // No "Bearer " prefix → bearerToken() returns null → x-pascal-mcp-token fallback also null → 401.
    const res = await postMcp(handle.port, '{}', { authorization: 'secret' })
    expect(res.status).toBe(401)
  })

  test('accepts auth via x-pascal-mcp-token header fallback', async () => {
    handle = await connectHttp(server, 0, { authToken: 'secret' })
    const res = await postMcp(handle.port, '{}', { 'x-pascal-mcp-token': 'secret' })
    // Auth passes (so not 401); body is invalid JSON-RPC so we don't check beyond auth.
    expect(res.status).not.toBe(401)
    await res.text()
  })

  test('returns 401 when token does not match (same length)', async () => {
    handle = await connectHttp(server, 0, { authToken: 'secret' })
    const res = await postMcp(handle.port, '{}', { authorization: 'Bearer secrxt' })
    expect(res.status).toBe(401)
  })
})

describe('http guard — request routing', () => {
  test('returns 404 for unknown paths', async () => {
    handle = await connectHttp(server, 0)
    const res = await fetch(`http://127.0.0.1:${handle.port}/not-mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    expect(res.status).toBe(404)
    const payload = (await res.json()) as { error: string }
    expect(payload.error).toBe('not_found')
  })

  test('OPTIONS preflight from a same-origin request returns 204 with CORS headers (no body)', async () => {
    // With strict-by-default CSRF hardening, only same-origin (Origin ==
    // Host) requests are accepted without an explicit allowlist entry.
    handle = await connectHttp(server, 0)
    const res = await fetch(`http://127.0.0.1:${handle.port}/mcp`, {
      method: 'OPTIONS',
      headers: {
        origin: `http://127.0.0.1:${handle.port}`,
        'access-control-request-method': 'POST',
      },
    })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-methods')).toContain('POST')
    expect(res.headers.get('access-control-allow-headers')).toContain('authorization')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })
})
