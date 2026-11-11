import { expect, test } from 'bun:test'

test('checks parametric action icons before rendering', () => {
  const result = Bun.spawnSync({
    cmd: [process.execPath, 'test', `${import.meta.dir}/parametric-icon-policy.fixture.tsx`],
    stdout: 'pipe',
    stderr: 'pipe',
  })
  expect(`${result.stdout.toString()}\n${result.stderr.toString()}`).toContain('1 pass')
  expect(result.exitCode).toBe(0)
}, 60000)
