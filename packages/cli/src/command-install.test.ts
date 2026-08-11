import { describe, expect, test } from 'bun:test'
import { installGlobalAedifexCommand, isNpxInvocation } from './command-install.js'

describe('short command installation', () => {
  test('recognizes npm exec package-runner invocations', () => {
    expect(isNpxInvocation({ npm_lifecycle_event: 'npx' })).toBe(true)
    expect(
      isNpxInvocation({ npm_command: 'exec', PATH: '/tmp/_npx/example/node_modules/.bin' }),
    ).toBe(true)
    expect(
      isNpxInvocation(
        {
          npm_command: 'exec',
          PATH: String.raw`C:\Windows;C:\Users\me\_npx\abc\node_modules\.bin`,
        },
        ';',
      ),
    ).toBe(true)
    expect(isNpxInvocation({ PATH: '/usr/local/bin:/usr/bin' })).toBe(false)
  })

  test('installs the exact running version without lifecycle scripts', async () => {
    let invocation: { command: string; args: string[] } | undefined
    const installed = await installGlobalAedifexCommand('1.2.3', async (command, args) => {
      invocation = { command, args }
      return 0
    })

    expect(installed).toBe(true)
    expect(invocation).toEqual({
      command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
      args: ['install', '--global', '--ignore-scripts', '@aedifex/cli@1.2.3'],
    })
  })

  test('reports an installer failure without throwing', async () => {
    expect(await installGlobalAedifexCommand('1.2.3', async () => 1)).toBe(false)
  })
})
