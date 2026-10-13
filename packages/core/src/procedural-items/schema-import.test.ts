import { expect, test } from 'bun:test'

const buildSchema = `
const loaded = new Set()
const build = await Bun.build({
  entrypoints: [process.argv[1]],
  target: 'browser',
  plugins: [{
    name: 'record-imports',
    setup(builder) {
      builder.onLoad({ filter: /\\.[tj]sx?$/ }, ({ path }) => {
        loaded.add(path)
        return undefined
      })
    },
  }],
})
if (!build.success) {
  console.error(build.logs)
  process.exit(1)
}
console.log(JSON.stringify({ source: await build.outputs[0].text(), loaded: [...loaded] }))
`

test.each([
  './node.ts',
  '../schema/types.ts',
])('a clean browser bundle can initialize %s without loading scene runtime', (entry) => {
  // Bun's onLoad bundler state can retain stale file buffers between builds in a long-lived
  // test process. Each entry needs its own process to verify a genuinely clean import graph.
  const entryPath = new URL(entry, import.meta.url).pathname
  const build = Bun.spawnSync(
    [process.execPath, '--eval', buildSchema, entryPath],
    { stdout: 'pipe', stderr: 'pipe' },
  )
  expect(build.stderr.toString()).toBe('')
  expect(build.exitCode).toBe(0)
  const { source, loaded } = JSON.parse(build.stdout.toString()) as {
    source: string
    loaded: string[]
  }
  expect(loaded).toContain(entryPath)
  const result = Bun.spawnSync(['node', '--input-type=module'], {
    stdin: Buffer.from(source),
    stdout: 'pipe',
    stderr: 'pipe',
  })
  expect(result.stderr.toString()).toBe('')
  expect(result.exitCode).toBe(0)
  expect(loaded.filter((path) => path.endsWith('/store/use-scene.ts'))).toEqual([])
  expect(loaded.filter((path) => path.endsWith('/spatial-grid-manager.ts'))).toEqual([])
})
