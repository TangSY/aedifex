import { join } from 'node:path'

const SOURCE_READ_BATCH_SIZE = 128

export async function findMatchingSources({
  root,
  paths,
  matches,
}: {
  root: string
  paths: string[]
  matches: (source: string) => boolean
}): Promise<string[]> {
  const matchingPaths: string[] = []
  for (let start = 0; start < paths.length; start += SOURCE_READ_BATCH_SIZE) {
    const reads = paths.slice(start, start + SOURCE_READ_BATCH_SIZE).map(async (path) => {
      const source = await Bun.file(join(root, path)).text()
      return matches(source) ? path : null
    })
    matchingPaths.push(...(await Promise.all(reads)).filter((path) => path !== null))
  }
  return matchingPaths
}
