import { afterAll, afterEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  ensureMcpService,
  getMcpServiceStatus,
  type McpServiceState,
  stopMcpService,
} from './mcp-service.js'
import { type AedifexPaths, resolveAedifexPaths } from './paths.js'
import { isProcessRunning } from './process-control.js'
import { readActiveRuntime } from './runtime.js'
import { writeFakeMcpService } from './test-support/fake-mcp-service.js'

const roots: string[] = []
const started: AedifexPaths[] = []
/** The MCP service ships with the CLI; the tests inject a stand-in for the bundled bundle. */
const serviceRoot = await mkdtemp(path.join(os.tmpdir(), 'aedifex-cli-mcp-service-'))
process.env.AEDIFEX_MCP_SERVICE_PATH = await writeFakeMcpService(serviceRoot)

afterEach(async () => {
  for (const paths of started.splice(0)) {
    await stopMcpService(paths, { force: true }).catch(() => undefined)
  }
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

afterAll(() => rm(serviceRoot, { recursive: true, force: true }))

describe('managed MCP service', () => {
  test('starts on demand without a web runtime installed', async () => {
    const paths = await temporaryPaths()

    const result = await ensureMcpService({ paths })

    expect(result.alreadyRunning).toBe(false)
    expect(result.state.editorOrigin).toBeNull()
    expect(result.state.host).toBe('127.0.0.1')
    expect(result.state.url).toBe(`http://127.0.0.1:${result.state.port}/mcp`)
    expect(await readActiveRuntime(paths)).toBeNull()
    expect(paths.mcpState.endsWith(path.join('run', 'mcp.json'))).toBe(true)
    const status = await getMcpServiceStatus(paths)
    expect(status).toMatchObject({ running: true, healthy: true })
    expect(status.state?.pid).toBe(result.state.pid)
    expect((await stat(paths.mcpToken)).mode & 0o077).toBe(0)
  })

  test('reuses a healthy service instead of starting a second one', async () => {
    const paths = await temporaryPaths()
    const first = await ensureMcpService({ paths })

    const second = await ensureMcpService({ paths })

    expect(second.alreadyRunning).toBe(true)
    expect(second.state.pid).toBe(first.state.pid)
    expect(second.state.instanceId).toBe(first.state.instanceId)
  })

  test('serializes concurrent starts into one service', async () => {
    const paths = await temporaryPaths()

    const [first, second] = await Promise.all([
      ensureMcpService({ paths }),
      ensureMcpService({ paths }),
    ])

    expect(first.state.pid).toBe(second.state.pid)
    expect([first.alreadyRunning, second.alreadyRunning].sort()).toEqual([false, true])
  })

  test('keeps the recorded editor origin when the caller does not run the editor', async () => {
    const paths = await temporaryPaths()
    const editorOrigin = 'http://aedifex.localhost:41234'
    const first = await ensureMcpService({ paths, editorOrigin })

    const connected = await ensureMcpService({ paths })

    expect(connected.alreadyRunning).toBe(true)
    expect(connected.state.pid).toBe(first.state.pid)
    expect(connected.state.editorOrigin).toBe(editorOrigin)
    expect(await reportedEditorOrigin(paths, connected.state)).toBe(editorOrigin)
  })

  test('restarts with the new origin when the editor moves to another port', async () => {
    const paths = await temporaryPaths()
    const first = await ensureMcpService({ paths, editorOrigin: 'http://aedifex.localhost:41234' })

    const moved = await ensureMcpService({ paths, editorOrigin: 'http://aedifex.localhost:41235' })

    expect(moved.alreadyRunning).toBe(false)
    expect(moved.state.pid).not.toBe(first.state.pid)
    expect(moved.state.editorOrigin).toBe('http://aedifex.localhost:41235')
    expect(await reportedEditorOrigin(paths, moved.state)).toBe('http://aedifex.localhost:41235')
  })

  test('stops the service once and clears its state and token', async () => {
    const paths = await temporaryPaths()
    await ensureMcpService({ paths })

    expect(await stopMcpService(paths)).toBe(true)
    expect(await stopMcpService(paths)).toBe(false)
    expect(await getMcpServiceStatus(paths)).toEqual({
      running: false,
      healthy: false,
      state: null,
    })
    expect(await exists(paths.mcpState)).toBe(false)
    expect(await exists(paths.mcpToken)).toBe(false)
  })

  test('retires an authenticated legacy MCP before replacing its shared token', async () => {
    const paths = await temporaryPaths()
    const first = await ensureMcpService({ paths })
    await writeFile(paths.state, JSON.stringify({
      schemaVersion: 1,
      pid: 999_999,
      version: first.state.version,
      instanceId: first.state.instanceId,
      runtimeDirectory: path.join(paths.runtime, first.state.version),
      mcp: { pid: first.state.pid, port: first.state.port },
    }))
    await rm(paths.mcpState)
    const previousToken = await readFile(paths.mcpToken, 'utf8')

    const migrated = await ensureMcpService({ paths })

    expect(migrated.state.pid).not.toBe(first.state.pid)
    expect(isProcessRunning(first.state.pid)).toBe(false)
    expect((await getMcpServiceStatus(paths)).healthy).toBe(true)
    expect(JSON.parse(await readFile(paths.state, 'utf8')).mcp).toBeUndefined()
    expect(await readFile(paths.mcpToken, 'utf8')).not.toBe(previousToken)
  })

  test('does not replace legacy credentials or kill an unverified process', async () => {
    const paths = await temporaryPaths(false)
    const legacyState = {
      version: '1.0.0',
      instanceId: 'foreign',
      runtimeDirectory: path.join(paths.runtime, '1.0.0'),
      mcp: { pid: process.pid, port: 1 },
    }
    await writeFile(paths.state, JSON.stringify(legacyState))
    await writeFile(paths.mcpToken, 'preserved-token')

    await expect(ensureMcpService({ paths })).rejects.toMatchObject({ code: 'state_conflict' })
    await expect(stopMcpService(paths, { force: true })).rejects.toMatchObject({ code: 'state_conflict' })
    expect(await readFile(paths.mcpToken, 'utf8')).toBe('preserved-token')
    expect(JSON.parse(await readFile(paths.state, 'utf8'))).toEqual(legacyState)
    expect(await exists(paths.mcpState)).toBe(false)
  })

  test('refuses to stop a recorded process that is not the MCP service', async () => {
    const paths = await temporaryPaths(false)
    await writeFile(
      paths.mcpState,
      JSON.stringify({
        schemaVersion: 1,
        pid: process.pid,
        port: 1,
        host: '127.0.0.1',
        url: 'http://127.0.0.1:1/mcp',
        version: '0.0.0',
        instanceId: 'not-the-service',
        servicePath: path.join(serviceRoot, 'aedifex-mcp.mjs'),
        editorOrigin: null,
        startedAt: new Date().toISOString(),
      }),
    )

    await expect(stopMcpService(paths)).rejects.toMatchObject({ code: 'state_conflict' })
    await expect(stopMcpService(paths, { force: true })).rejects.toMatchObject({
      code: 'state_conflict',
    })
    await rm(paths.mcpState, { force: true })
  })
})

async function temporaryPaths(tracked = true): Promise<AedifexPaths> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aedifex-cli-mcp-test-'))
  roots.push(root)
  const paths = resolveAedifexPaths({ AEDIFEX_HOME: path.join(root, 'home') })
  await mkdir(paths.run, { recursive: true, mode: 0o700 })
  if (tracked) started.push(paths)
  return paths
}

/** The stand-in service echoes the origin it was started with, proving the restart repointed it. */
async function reportedEditorOrigin(
  paths: AedifexPaths,
  state: McpServiceState,
): Promise<string | null> {
  const token = (await readFile(paths.mcpToken, 'utf8')).trim()
  const response = await fetch(`http://127.0.0.1:${state.port}/health`, {
    headers: { authorization: `Bearer ${token}` },
  })
  return ((await response.json()) as { editorOrigin: string | null }).editorOrigin
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file)
    return true
  } catch {
    return false
  }
}
