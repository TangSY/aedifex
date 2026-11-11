import { expect, test } from 'bun:test'

// The fixture mocks next/image, so run it separately from the rest of the suite.
test('checks node thumbnails before they reach the image optimizer', () => {
  const result = Bun.spawnSync({
    cmd: [process.execPath, 'test', `${import.meta.dir}/node-icon-image.fixture.tsx`],
    stdout: 'pipe',
    stderr: 'pipe',
  })
  expect(`${result.stdout.toString()}\n${result.stderr.toString()}`).toContain('1 pass')
  expect(result.exitCode).toBe(0)
}, 30000)
