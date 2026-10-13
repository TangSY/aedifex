import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { SceneGraph } from '@aedifex/core/clone-scene-graph'
import { resolveDefaultDatabasePath } from '@aedifex/mcp/storage'
import { getSceneOperations } from './scene-store-server'

const SCENE_ID = /^[A-Za-z0-9_-]{1,64}$/

function sharesDirectory(): string {
  return join(dirname(resolveDefaultDatabasePath()), 'shares')
}

export function shareFile(id: string): string {
  if (!SCENE_ID.test(id)) throw new Error('Invalid scene id')
  return join(sharesDirectory(), id)
}

export async function isSceneShared(id: string): Promise<boolean> {
  if (!SCENE_ID.test(id)) return false
  try {
    return (await stat(shareFile(id))).isFile()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

export async function setSceneShared(id: string, shared: boolean): Promise<void> {
  const file = shareFile(id)
  if (shared) {
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, '')
  } else {
    await rm(file, { force: true })
  }
}

export function deleteSceneShare(id: string): Promise<void> {
  return setSceneShared(id, false)
}

export async function sharedSceneIds(): Promise<string[]> {
  try {
    const entries = await readdir(sharesDirectory(), { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile() && SCENE_ID.test(entry.name))
      .map((entry) => entry.name)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

/** Publishing geometry must never publish the authored JS or Python module alongside it. */
export function sceneHasGeometryArtifact({
  graph,
  sha256,
}: {
  graph: SceneGraph
  sha256: string
}): boolean {
  if (!/^[0-9a-f]{64}$/.test(sha256)) return false
  let geometry = false
  for (const node of Object.values(graph.nodes)) {
    if (
      node.type === 'item' ||
      node.type === 'door' ||
      node.type === 'window' ||
      node.type === 'column'
    ) {
      if (node.source?.script === sha256) return false
      if (node.source?.artifact === sha256) geometry = true
    }
    if (node.type === 'item' && node.asset.src === `artifact://${sha256}`) geometry = true
  }
  return geometry
}

export function isGlbArtifact(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 12) return false
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return (
    header.getUint32(0, true) === 0x46546c67 &&
    header.getUint32(4, true) === 2 &&
    header.getUint32(8, true) === bytes.byteLength
  )
}

export async function isArtifactShared(sha256: string): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(sha256)) return false
  const ids = await sharedSceneIds()
  if (ids.length === 0) return false
  const operations = await getSceneOperations()
  for (const id of ids) {
    const scene = await operations.loadStoredScene(id)
    if (scene && sceneHasGeometryArtifact({ graph: scene.graph, sha256 })) return true
  }
  return false
}
