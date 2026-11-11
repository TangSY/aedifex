import { expect, test } from 'bun:test'

test('checks function category icons before they reach the image optimizer', () => {
  const result = Bun.spawnSync({
    cmd: [process.execPath, 'test', `${import.meta.dir}/function-tree-policy.fixture.tsx`],
    stdout: 'pipe',
    stderr: 'pipe',
  })
  expect(`${result.stdout.toString()}\n${result.stderr.toString()}`).toContain('2 pass')
  expect(result.exitCode).toBe(0)
}, 30000)
