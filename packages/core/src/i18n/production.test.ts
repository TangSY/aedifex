import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

test('standalone viewer formats English messages in production and permits host overrides', () => {
  const entry = fileURLToPath(new URL('./index.ts', import.meta.url))
  const result = Bun.spawnSync(
    [
      'bun',
      '--eval',
      `
    import { createI18n, registerCompiledMessages } from ${JSON.stringify(entry)}
    const descriptor = { id: 'viewer.walkthrough.label', message: 'Walkthrough: {state}', values: { state: 'On' } }
    const scope = createI18n()
    console.log(scope._(descriptor))
    console.log(createI18n({ locale: 'fr' })._(descriptor))
    registerCompiledMessages('en', '', { 'viewer.walkthrough.label': ['Custom: ', ['state']] })
    console.log(createI18n()._(descriptor))
  `,
    ],
    { env: { ...process.env, NODE_ENV: 'production' }, stdout: 'pipe', stderr: 'pipe' },
  )
  expect(result.exitCode).toBe(0)
  expect(result.stdout.toString().trim().split('\n')).toEqual([
    'Walkthrough: On',
    'Walkthrough: On',
    'Custom: On',
  ])
})
