import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SceneGraph } from '@aedifex/core/clone-scene-graph'
import { ItemNode, GeometryArtifactManifest } from '@aedifex/core/schema'
import { DiskArtifactStore } from '@aedifex/mcp/storage'
import { GET as getArtifact } from '../app/api/artifacts/[sha256]/route'
import { __resetSceneStoreForTests, __setSceneStoreForTests } from './scene-store-server'
import {
  deleteSceneShare,
  isSceneShared,
  setSceneShared,
  sharedSceneIds,
  shareFile,
  sceneHasGeometryArtifact,
  isGlbArtifact,
} from './scene-sharing'

test('scenes are private until shared and persist share flags beside the database', async () => {
  const tempDir = await mkdtemp(
    join(fileURLToPath(new URL('../../../.git/', import.meta.url)), 'scene-sharing-'),
  )
  const savedEnv = {
    AEDIFEX_DATA_DIR: process.env.AEDIFEX_DATA_DIR,
    AEDIFEX_DB_PATH: process.env.AEDIFEX_DB_PATH,
  }
  try {
    process.env.AEDIFEX_DATA_DIR = tempDir
    delete process.env.AEDIFEX_DB_PATH
    expect(shareFile('scene_1')).toBe(join(tempDir, 'shares', 'scene_1'))
    process.env.AEDIFEX_DB_PATH = join(tempDir, 'custom', 'scene.db')
    expect(shareFile('scene_1')).toBe(join(tempDir, 'custom', 'shares', 'scene_1'))
    expect(await isSceneShared('scene_1')).toBe(false)
    expect(await sharedSceneIds()).toEqual([])

    await setSceneShared('scene_1', true)
    expect(await readFile(shareFile('scene_1'), 'utf8')).toBe('')
    expect(await isSceneShared('scene_1')).toBe(true)
    expect(await sharedSceneIds()).toEqual(['scene_1'])
    await setSceneShared('scene_1', false)
    expect(await isSceneShared('scene_1')).toBe(false)
    expect(await sharedSceneIds()).toEqual([])

    await setSceneShared('scene_1', true)
    await deleteSceneShare('scene_1')
    await deleteSceneShare('scene_1')
    expect(await isSceneShared('scene_1')).toBe(false)
    expect(await sharedSceneIds()).toEqual([])
  } finally {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('share files reject invalid scene ids; a lookup just says not shared', async () => {
  for (const id of ['', '../escape', 'a/b', 'a.b', 'a'.repeat(65)]) {
    expect(() => shareFile(id)).toThrow('Invalid scene id')
    expect(await isSceneShared(id)).toBe(false)
    await expect(setSceneShared(id, true)).rejects.toThrow('Invalid scene id')
    await expect(deleteSceneShare(id)).rejects.toThrow('Invalid scene id')
  }
})

const hashOf = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const graphWithArtifact = (artifact: string, script?: string): SceneGraph => {
  const item = ItemNode.parse({
    id: 'item_shared',
    asset: {
      id: 'shared',
      name: 'Shared model',
      category: 'object',
      thumbnail: '',
      src: `artifact://${artifact}`,
    },
    ...(script
      ? {
          source: {
            kind: 'script',
            language: 'three',
            script,
            artifact,
            manifest: GeometryArtifactManifest.parse({
              bounds: { min: [0, 0, 0], max: [1, 1, 1] },
              triangles: 12,
            }),
          },
        }
      : {}),
  })
  return { nodes: { [item.id]: item }, rootNodeIds: [item.id] }
}

test('only explicit geometry references are public; JS/Python sources and metadata hashes stay private', () => {
  const artifact = 'a'.repeat(64)
  const script = 'b'.repeat(64)
  const hidden = 'c'.repeat(64)
  const graph = graphWithArtifact(artifact, script)
  graph.nodes.item_shared!.metadata = { arbitraryHash: hidden }
  expect(sceneHasGeometryArtifact({ graph, sha256: artifact })).toBe(true)
  expect(sceneHasGeometryArtifact({ graph, sha256: script })).toBe(false)
  expect(sceneHasGeometryArtifact({ graph, sha256: hidden })).toBe(false)
  expect(sceneHasGeometryArtifact({ graph, sha256: artifact.slice(1) })).toBe(false)
  const node = graph.nodes.item_shared!
  if (node.type !== 'item' || !node.source) throw Error('Missing authored item')
  node.source.language = 'bpy'
  expect(sceneHasGeometryArtifact({ graph, sha256: script })).toBe(false)
  node.asset.src = `artifact://${script}`
  expect(sceneHasGeometryArtifact({ graph, sha256: script })).toBe(false)
})

test('a text file beginning with glTF is not a compiled geometry artifact', () => {
  expect(
    isGlbArtifact(new TextEncoder().encode('glTF = 1; export default function build() {}')),
  ).toBe(false)
})

test('anonymous artifact reads serve shared GLB geometry while both source languages remain private', async () => {
  const tempDir = await mkdtemp(
    join(fileURLToPath(new URL('../../../.git/', import.meta.url)), 'shared-artifacts-'),
  )
  const keys = [
    'AEDIFEX_DB_PATH',
    'AEDIFEX_AUTH',
    'AEDIFEX_ADMIN_PASSWORD',
    'AEDIFEX_SCENE_API_TOKEN',
    'NODE_ENV',
  ] as const
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
  try {
    const database = join(tempDir, 'scene.db')
    process.env.AEDIFEX_DB_PATH = database
    process.env.NODE_ENV = 'production'
    process.env.AEDIFEX_ADMIN_PASSWORD = 'test-admin'
    delete process.env.AEDIFEX_AUTH
    delete process.env.AEDIFEX_SCENE_API_TOKEN
    const artifactStore = new DiskArtifactStore(database)
    const glb = new Uint8Array(
      await readFile(
        new URL(
          '../../../packages/geometry-script/src/__fixtures__/blender/cabinet.glb',
          import.meta.url,
        ),
      ),
    )
    const artifact = hashOf(glb)
    await artifactStore.put(artifact, glb)
    const sources = [
      new TextEncoder().encode('export default function build() {}'),
      new TextEncoder().encode('def build(params): return None'),
    ]
    let graph = graphWithArtifact(artifact, hashOf(sources[0]!))
    __setSceneStoreForTests(
      {} as never,
      {
        loadStoredScene: async () => ({ graph }),
      } as never,
    )
    await setSceneShared('scene_sources', true)
    const requestArtifact = (sha256: string) =>
      getArtifact(
        new Request(`https://aedifex.example/api/artifacts/${sha256}`, {
          headers: { host: 'aedifex.example' },
        }),
        { params: Promise.resolve({ sha256 }) },
      )
    const publicGeometry = await requestArtifact(artifact)
    expect(publicGeometry.status).toBe(200)
    expect(publicGeometry.headers.get('content-type')).toBe('model/gltf-binary')
    expect(new Uint8Array(await publicGeometry.arrayBuffer())).toEqual(glb)
    for (const source of sources) {
      const script = hashOf(source)
      await artifactStore.put(script, source)
      graph = graphWithArtifact(artifact, script)
      expect((await requestArtifact(script)).status).toBe(401)
      // Even an explicit model URI must not publish bytes that are actually source text.
      graph = graphWithArtifact(script)
      expect((await requestArtifact(script)).status).toBe(401)
    }
    await setSceneShared('scene_sources', false)
    expect((await requestArtifact(artifact)).status).toBe(401)
  } finally {
    __resetSceneStoreForTests()
    for (const key of keys) {
      const value = saved[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    await rm(tempDir, { recursive: true, force: true })
  }
})
