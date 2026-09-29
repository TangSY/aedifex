import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const buildDirectory = path.join(packageDirectory, 'build')
await mkdir(buildDirectory, { recursive: true })
const smokeRoot = await mkdtemp(path.join(buildDirectory, 'smoke-'))
const executable = path.join(packageDirectory, 'dist/bin/aedifex.js')
const defaultPortBlocker = http.createServer((_request, response) => {
  response.setHeader('content-type', 'application/json')
  response.end(JSON.stringify({ status: 'ok', app: 'foreign' }))
})
const mcpOnlyEnvironment = {
  ...process.env,
  AEDIFEX_HOME: path.join(smokeRoot, 'home-mcp-only'),
  AEDIFEX_NO_OPEN: '1',
}
const smokeEnvironment = {
  ...process.env,
  AEDIFEX_HOME: path.join(smokeRoot, 'home'),
  AEDIFEX_NO_OPEN: '1',
}

try {
  await listen(defaultPortBlocker)
  await checkMcpWithoutWebRuntime(executable)
  await checkEditorFromLocalRuntime(executable, path.join(packageDirectory, 'dist/runtime'))
  console.log('Locally staged CLI runtime smoke passed.')
} finally {
  await close(defaultPortBlocker)
  for (const environment of [smokeEnvironment, mcpOnlyEnvironment]) {
    await run(process.execPath, [executable, 'stop', '--force', '--json'], undefined, environment)
      .catch(() => undefined)
  }
  await rm(smokeRoot, { recursive: true, force: true })
}

async function checkMcpWithoutWebRuntime(executable: string): Promise<void> {
  const client = new Client({ name: 'aedifex-cli-smoke-mcp-only', version: '0.0.0' })
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [executable, 'mcp', 'connect'],
    env: mcpOnlyEnvironment as Record<string, string>,
    stderr: 'pipe',
  })
  try {
    await client.connect(transport)
    const tools = await client.listTools()
    if (!tools.tools.some((tool) => tool.name === 'save_scene')) {
      throw new Error('MCP-only mode did not expose save_scene')
    }
    const saved = await client.callTool({
      name: 'save_scene',
      arguments: { id: 'mcp-only-project', name: 'MCP only project' },
    })
    if (saved.isError) throw new Error(`MCP-only save_scene failed: ${JSON.stringify(saved)}`)
    const listed = await client.callTool({ name: 'list_scenes', arguments: {} })
    if (listed.isError || !JSON.stringify(listed).includes('mcp-only-project')) {
      throw new Error(`MCP-only list_scenes failed: ${JSON.stringify(listed)}`)
    }
    console.log(
      `MCP-only mode exposed ${tools.tools.length} tools and stored a scene with no web runtime installed.`,
    )
  } finally {
    await client.close()
  }
  const status = JSON.parse(
    (await run(process.execPath, [executable, 'status', '--json'], undefined, mcpOnlyEnvironment))
      .stdout,
  ) as { installed: boolean; running: boolean; runtime: unknown; mcp: { healthy: boolean } }
  if (status.installed || status.runtime !== null || status.running) {
    throw new Error('MCP-only mode installed or started the web runtime')
  }
  if (!status.mcp.healthy) throw new Error('the managed MCP service is not healthy on its own')
  const stopped = JSON.parse(
    (await run(process.execPath, [executable, 'stop', '--json'], undefined, mcpOnlyEnvironment))
      .stdout,
  ) as { stopped: boolean }
  if (!stopped.stopped) throw new Error('stop did not report the MCP-only service as stopped')
}

async function checkEditorFromLocalRuntime(executable: string, runtimeDirectory: string): Promise<void> {
  const started = JSON.parse(
    (
      await run(
        process.execPath,
        [executable, 'editor', '--no-open', '--json', '--runtime', runtimeDirectory],
        undefined,
        smokeEnvironment,
      )
    ).stdout,
  ) as { pid: number; port: number; url: string; mcp: { port: number } }
  if (started.port === 3000) throw new Error('editor reused the occupied default port')
  if (!started.mcp?.port) throw new Error('the editor did not report a managed MCP port')
  const rootResponse = await fetch(`http://127.0.0.1:${started.port}/`)
  if (!rootResponse.ok) throw new Error(`editor root returned ${rootResponse.status}`)
  const scenesResponse = await fetch(`${started.url}/scenes`)
  if (!scenesResponse.ok) throw new Error(`editor scenes returned ${scenesResponse.status}`)
  const repeatedStart = JSON.parse(
    (
      await run(
        process.execPath,
        [executable, 'editor', '--no-open', '--port', '0', '--json'],
        undefined,
        smokeEnvironment,
      )
    ).stdout,
  ) as { alreadyRunning: boolean; pid: number; port: number }
  if (
    !repeatedStart.alreadyRunning ||
    repeatedStart.pid !== started.pid ||
    repeatedStart.port !== started.port
  ) {
    throw new Error('a repeated editor command did not reuse the managed process')
  }
  const humanStart = await run(
    process.execPath,
    [executable, 'editor', '--no-open'],
    undefined,
    smokeEnvironment,
  )
  if (
    !humanStart.stdout.includes('aedifex status') ||
    humanStart.stdout.includes('npm install --global @aedifex/cli')
  ) {
    throw new Error('direct CLI start output did not use the persistent aedifex command')
  }
  await run(
    process.execPath,
    [executable, 'project', 'list', '--json'],
    undefined,
    smokeEnvironment,
  )
  const mcpTransport = new StdioClientTransport({
    command: process.execPath,
    args: [executable, 'mcp', 'connect'],
    env: smokeEnvironment as Record<string, string>,
    stderr: 'pipe',
  })
  const mcpClient = new Client({ name: 'aedifex-cli-smoke', version: '0.0.0' })
  try {
    await mcpClient.connect(mcpTransport)
    const tools = await mcpClient.listTools()
    if (!tools.tools.some((tool) => tool.name === 'save_scene')) {
      throw new Error('managed MCP did not expose save_scene')
    }
    const saved = await mcpClient.callTool({
      name: 'save_scene',
      arguments: { id: 'smoke-project', name: 'Smoke project' },
    })
    if (saved.isError) throw new Error(`managed MCP save_scene failed: ${JSON.stringify(saved)}`)
  } finally {
    await mcpClient.close()
  }
  const resumed = JSON.parse(
    (
      await run(
        process.execPath,
        [executable, 'resume', 'Smoke project', '--json'],
        undefined,
        smokeEnvironment,
      )
    ).stdout,
  ) as { project: { id: string }; url: string }
  if (resumed.project.id !== 'smoke-project' || !resumed.url.endsWith('/scene/smoke-project')) {
    throw new Error('CLI project resume did not resolve the MCP-saved project')
  }
  console.log(
    `Editor installed from ${path.basename(runtimeDirectory)} on port ${started.port}, MCP on port ${started.mcp.port}, and a scene round-tripped between MCP and the CLI.`,
  )
  await run(process.execPath, [executable, 'doctor', '--json'], undefined, smokeEnvironment)
  await run(process.execPath, [executable, 'stop', '--json'], undefined, smokeEnvironment)
}

async function listen(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', (error: NodeJS.ErrnoException) =>
      error.code === 'EADDRINUSE' ? resolve() : reject(error),
    )
    server.listen({ host: '::', port: 3000, ipv6Only: false }, resolve)
  })
}

async function close(server: http.Server): Promise<void> {
  if (!server.listening) return
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
}

async function run(
  command: string,
  args: string[],
  cwd?: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ stdout: string; stderr: string }> {
  const result = await capture(command, args, cwd, env)
  if (result.exitCode !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed (${result.exitCode}): ${result.stderr}`)
  }
  return result
}

async function capture(
  command: string,
  args: string[],
  cwd?: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const executable = process.platform === 'win32' && command === 'npm' ? 'npm.cmd' : command
  const child = spawn(executable, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
  const stdout: Buffer[] = []
  const stderr: Buffer[] = []
  child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
  child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => resolve(code ?? 1))
  })
  return {
    exitCode,
    stdout: Buffer.concat(stdout).toString('utf8'),
    stderr: Buffer.concat(stderr).toString('utf8'),
  }
}
