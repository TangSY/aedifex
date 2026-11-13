import { expect, test } from 'bun:test'
import { captureRegistryVersions, effectIds, openDetachedScene } from '@aedifex/core/runtime'
import { SiteNode } from '@aedifex/core/schema'
import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { SceneBridge } from '../bridge/scene-bridge'
import { createSceneOperations } from '../operations'
import { createAedifexMcpServer } from '../server'
import type { GeometryScriptHost } from './add-object'

test('author_scene reads the active project file and rejects ambiguous or unavailable inputs', async () => {
  const bridge = new SceneBridge()
  bridge.setScene({}, [], { materials: {} })
  const operations = createSceneOperations({ bridge })
  operations.loadDefault()
  bridge.setActiveScene({ id: 'scene_a', name: 'Scene', projectId: 'project_a' } as never)
  const reads: unknown[] = []
  let switchProject = false
  const host: GeometryScriptHost = {
    compile: async () => {
      throw new Error('unexpected compile')
    },
    storeArtifact: async ({ sha256 }) => sha256,
    readArtifact: async () => null,
  }
  const server = createAedifexMcpServer({
    bridge,
    operations,
    geometryScripts: host,
    readProjectFile: async (request) => {
      reads.push(request)
      if (switchProject)
        bridge.setActiveScene({ ...bridge.getActiveScene()!, projectId: 'project_b' })
      return new TextEncoder().encode(JSON.stringify({ levels: [{ name: 'Ground' }] }))
    },
  })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test', version: '0' })
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  try {
    const both = await client.callTool({
      name: 'author_scene',
      arguments: { payload: { levels: [{ name: 'Ground' }] }, payloadFile: 'asset_a' },
    })
    expect(both.isError).toBe(true)
    expect(JSON.stringify(both)).toContain('payload_twice')
    expect(reads).toHaveLength(0)
    const before = JSON.stringify(bridge.getNodes())
    switchProject = true
    const changed = await client.callTool({
      name: 'author_scene',
      arguments: { payloadFile: 'asset_a' },
    })
    expect(changed.isError).toBe(true)
    expect(JSON.stringify(changed)).toContain('scene_changed')
    expect(JSON.stringify(bridge.getNodes())).toBe(before)
    switchProject = false
    bridge.setActiveScene({ ...bridge.getActiveScene()!, projectId: 'project_a' })
    reads.length = 0
    const result = await client.callTool({
      name: 'author_scene',
      arguments: { payloadFile: 'asset_a' },
    })
    expect(result.isError, JSON.stringify(result)).toBeFalsy()
    expect(reads).toMatchObject([
      { projectId: 'project_a', fileId: 'asset_a', maxBytes: 32 * 1024 * 1024 },
    ])
  } finally {
    await client.close()
    await server.close()
  }
})

test('author_scene file input preserves deterministic ids in a detached scene', async () => {
  async function run() {
    const scene = openDetachedScene(
      { nodes: {}, rootNodeIds: [], collections: {}, materials: {}, installedPlugins: [] },
      {
        base: { kind: 'authority', seq: 1 },
        context: {
          activeLevelId: null,
          selection: [],
          units: 'metric',
          catalogVersion: 'test',
          registryVersions: captureRegistryVersions(),
        },
        ids: effectIds('author_scene_file_effect'),
      },
    )
    const bridge = new SceneBridge({ runtime: scene })
    const operations = createSceneOperations({ bridge })
    scene.run(() => operations.loadDefault())
    bridge.setActiveScene({ id: 'scene_a', name: 'Scene', projectId: 'project_a' } as never)
    const host: GeometryScriptHost = {
      compile: async () => {
        throw new Error('unexpected compile')
      },
      storeArtifact: async ({ sha256 }) => sha256,
      readArtifact: async () => null,
    }
    const server = createAedifexMcpServer({
      bridge,
      operations,
      geometryScripts: host,
      readProjectFile: async () =>
        new TextEncoder().encode(
          JSON.stringify({
            levels: [
              {
                name: 'Ground',
                walls: [
                  { id: 'north', start: [0, 0], end: [4, 0] },
                  { id: 'east', start: [4, 0], end: [4, 4] },
                  { id: 'south', start: [4, 4], end: [0, 4] },
                  { id: 'west', start: [0, 4], end: [0, 0] },
                ].map((wall) => ({ ...wall, height: 2.7, thickness: 0.1 })),
                rooms: [{ name: 'Room', seed: [2, 2] }],
              },
            ],
          }),
        ),
    })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'detached-author-scene', version: '1' })
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
    try {
      const result = await client.callTool({
        name: 'author_scene',
        arguments: { payloadFile: 'asset_a' },
      })
      expect(result.isError, JSON.stringify(result)).toBeFalsy()
      const nodes = bridge.getNodes()
      expect(Object.values(nodes).some((node) => node.type === 'zone')).toBe(true)
      return Object.keys(nodes).sort()
    } finally {
      await client.close()
      await server.close()
      scene.dispose()
    }
  }
  expect(await run()).toEqual(await run())
})

test.each(['material', 'collection', 'active level'] as const)(
  'author_scene refuses a %s edit while reading the payload',
  async (kind) => {
    const bridge = new SceneBridge()
    bridge.setScene({}, [], { materials: {} })
    let activeLevel: string | null = null
    const operations = createSceneOperations({ bridge, activeLevelId: () => activeLevel })
    operations.loadDefault()
    bridge.setActiveScene({ id: 'scene_a', name: 'Scene', projectId: 'project_a' } as never)
    const before = JSON.stringify(bridge.getNodes())
    const server = createAedifexMcpServer({
      bridge,
      operations,
      geometryScripts: {
        compile: async () => {
          throw new Error('unexpected compile')
        },
        storeArtifact: async ({ sha256 }) => sha256,
        readArtifact: async () => null,
      },
      readProjectFile: async () => {
        if (kind === 'material')
          bridge.applyPatch([
            {
              op: 'upsert_material',
              material: { id: 'mat_concurrent', name: 'Paint', material: {} },
            },
          ])
        else if (kind === 'collection')
          bridge.setCollections({
            collection_concurrent: { id: 'collection_concurrent', name: 'Group', nodeIds: [] },
          })
        else activeLevel = 'level_other'
        return new TextEncoder().encode(JSON.stringify({ levels: [{ name: 'Ground' }] }))
      },
    })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'author-concurrent', version: '1' })
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
    try {
      const result = await client.callTool({
        name: 'author_scene',
        arguments: { payloadFile: 'asset_a' },
      })
      expect(result.isError).toBe(true)
      expect(JSON.stringify(result)).toContain('scene_changed')
      expect(JSON.stringify(bridge.getNodes())).toBe(before)
      if (kind === 'material') expect(bridge.getMaterials().mat_concurrent?.name).toBe('Paint')
      else if (kind === 'collection')
        expect(bridge.getCollections().collection_concurrent?.name).toBe('Group')
      else expect(activeLevel).toBe('level_other')
    } finally {
      await client.close()
      await server.close()
    }
  },
)

test.each(['root order', 'installed plugins'] as const)(
  'author_scene refuses a change to %s during file input',
  async (kind) => {
    const scene = openDetachedScene(
      { nodes: {}, rootNodeIds: [], collections: {}, materials: {}, installedPlugins: [] },
      {
        base: { kind: 'authority', seq: 1 },
        context: {
          activeLevelId: null,
          selection: [],
          units: 'metric',
          catalogVersion: 'test',
          registryVersions: captureRegistryVersions(),
        },
        ids: effectIds('author_guard_effect'),
      },
    )
    const bridge = new SceneBridge({ runtime: scene })
    const operations = createSceneOperations({ bridge })
    scene.run(() => operations.loadDefault())
    const extraSite = SiteNode.parse({ id: 'site_extra' })
    scene.store.setState((state) => ({
      nodes: { ...state.nodes, [extraSite.id]: extraSite },
      rootNodeIds: [...state.rootNodeIds, extraSite.id],
    }))
    bridge.setActiveScene({ id: 'scene_a', name: 'Scene', projectId: 'project_a' } as never)
    const before = JSON.stringify(bridge.getNodes())
    const roots = bridge.getRootNodeIds()
    const server = createAedifexMcpServer({
      bridge,
      operations,
      geometryScripts: {
        compile: async () => {
          throw new Error('unexpected compile')
        },
        storeArtifact: async ({ sha256 }) => sha256,
        readArtifact: async () => null,
      },
      readProjectFile: async () => {
        if (kind === 'root order') scene.store.setState({ rootNodeIds: [...roots].reverse() })
        else scene.store.getState().setInstalledPlugins(['aedifex:test'])
        return new TextEncoder().encode(JSON.stringify({ levels: [{ name: 'Ground' }] }))
      },
    })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'author-context-guard', version: '1' })
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
    try {
      const result = await client.callTool({
        name: 'author_scene',
        arguments: { payloadFile: 'asset_a' },
      })
      expect(result.isError).toBe(true)
      expect(JSON.stringify(result)).toContain('scene_changed')
      expect(JSON.stringify(bridge.getNodes())).toBe(before)
      if (kind === 'root order') expect(bridge.getRootNodeIds()).toEqual([...roots].reverse())
      else expect(bridge.getInstalledPlugins()).toContain('aedifex:test')
    } finally {
      await client.close()
      await server.close()
      scene.dispose()
    }
  },
)

test('author_scene refuses a material edit during provenance storage', async () => {
  const bridge = new SceneBridge()
  bridge.setScene({}, [], { materials: {} })
  const operations = createSceneOperations({ bridge })
  operations.loadDefault()
  bridge.setActiveScene({ id: 'scene_a', name: 'Scene', projectId: 'project_a' } as never)
  const before = JSON.stringify(bridge.getNodes())
  const server = createAedifexMcpServer({
    bridge,
    operations,
    geometryScripts: {
      compile: async () => {
        throw new Error('unexpected compile')
      },
      storeArtifact: async ({ sha256 }) => {
        bridge.applyPatch([
          {
            op: 'upsert_material',
            material: { id: 'mat_during_store', name: 'Paint', material: {} },
          },
        ])
        return sha256
      },
      readArtifact: async () => null,
    },
  })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'author-store-guard', version: '1' })
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  try {
    const result = await client.callTool({
      name: 'author_scene',
      arguments: { payload: { levels: [{ name: 'Ground' }] }, module: 'export default {}' },
    })
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result)).toContain('scene_changed')
    expect(JSON.stringify(bridge.getNodes())).toBe(before)
    expect(bridge.getMaterials().mat_during_store?.name).toBe('Paint')
  } finally {
    await client.close()
    await server.close()
  }
})

test('author_scene does not write when file reading is cancelled', async () => {
  const bridge = new SceneBridge()
  bridge.setScene({}, [], { materials: {} })
  const operations = createSceneOperations({ bridge })
  operations.loadDefault()
  bridge.setActiveScene({ id: 'scene_a', name: 'Scene', projectId: 'project_a' } as never)
  const before = JSON.stringify(bridge.exportJSON())
  const controller = new AbortController()
  let stored = false
  const server = createAedifexMcpServer({
    bridge,
    operations,
    geometryScripts: {
      signal: controller.signal,
      compile: async () => {
        throw new Error('unexpected compile')
      },
      storeArtifact: async ({ sha256 }) => {
        stored = true
        return sha256
      },
      readArtifact: async () => null,
    },
    readProjectFile: async ({ signal }) => {
      expect(signal).toBe(controller.signal)
      controller.abort()
      return new TextEncoder().encode(JSON.stringify({ levels: [{ name: 'Ground' }] }))
    },
  })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'author-cancellation', version: '1' })
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  try {
    const result = await client.callTool({
      name: 'author_scene',
      arguments: { payloadFile: 'asset_a', module: 'export default {}' },
    })
    expect(result.isError).toBe(true)
    expect(stored).toBe(false)
    expect(JSON.stringify(bridge.exportJSON())).toBe(before)
  } finally {
    await client.close()
    await server.close()
  }
})

test('author_scene stops storing provenance when cancelled between artifacts', async () => {
  const bridge = new SceneBridge()
  bridge.setScene({}, [], { materials: {} })
  const operations = createSceneOperations({ bridge })
  operations.loadDefault()
  bridge.setActiveScene({ id: 'scene_a', name: 'Scene', projectId: 'project_a' } as never)
  const before = JSON.stringify(bridge.exportJSON())
  const controller = new AbortController()
  let stores = 0
  const server = createAedifexMcpServer({
    bridge,
    operations,
    geometryScripts: {
      signal: controller.signal,
      compile: async () => {
        throw new Error('unexpected compile')
      },
      storeArtifact: async ({ sha256 }) => {
        stores++
        controller.abort()
        return sha256
      },
      readArtifact: async () => null,
    },
  })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'author-provenance-cancel', version: '1' })
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  try {
    const result = await client.callTool({
      name: 'author_scene',
      arguments: {
        payload: { levels: [{ name: 'Ground' }] },
        module: 'module',
        adapter: 'adapter',
      },
    })
    expect(result.isError).toBe(true)
    expect(stores).toBe(1)
    expect(JSON.stringify(bridge.exportJSON())).toBe(before)
  } finally {
    await client.close()
    await server.close()
  }
})

test('author_scene does not commit when cancelled during the final host check', async () => {
  const bridge = new SceneBridge()
  bridge.setScene({}, [], { materials: {} })
  const operations = createSceneOperations({ bridge })
  operations.loadDefault()
  bridge.setActiveScene({ id: 'scene_a', name: 'Scene', projectId: 'project_a' } as never)
  const before = JSON.stringify(bridge.exportJSON())
  const controller = new AbortController()
  let checks = 0
  const server = createAedifexMcpServer({
    bridge,
    operations,
    geometryScripts: {
      signal: controller.signal,
      assertActive: async () => {
        if (++checks === 2) controller.abort()
      },
      compile: async () => {
        throw new Error('unexpected compile')
      },
      storeArtifact: async ({ sha256 }) => sha256,
      readArtifact: async () => null,
    },
  })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'author-final-cancel', version: '1' })
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  try {
    const result = await client.callTool({
      name: 'author_scene',
      arguments: { payload: { levels: [{ name: 'Ground' }] } },
    })
    expect(checks).toBe(2)
    expect(result.isError).toBe(true)
    expect(JSON.stringify(bridge.exportJSON())).toBe(before)
  } finally {
    await client.close()
    await server.close()
  }
})

test.each(['projectId', 'graphHash'] as const)(
  'author_scene rejects an in-place %s change during file input',
  async (field) => {
    const bridge = new SceneBridge()
    bridge.setScene({}, [], { materials: {} })
    const operations = createSceneOperations({ bridge })
    operations.loadDefault()
    bridge.setActiveScene({ id: 'scene_a', name: 'Scene', projectId: 'project_a' } as never)
    const before = JSON.stringify(bridge.getNodes())
    const server = createAedifexMcpServer({
      bridge,
      operations,
      geometryScripts: {
        compile: async () => {
          throw new Error('unexpected compile')
        },
        storeArtifact: async ({ sha256 }) => sha256,
        readArtifact: async () => null,
      },
      readProjectFile: async () => {
        bridge.getActiveScene()![field] = 'changed'
        return new TextEncoder().encode(JSON.stringify({ levels: [{ name: 'Ground' }] }))
      },
    })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'author-mutated-context', version: '1' })
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
    try {
      const result = await client.callTool({
        name: 'author_scene',
        arguments: { payloadFile: 'asset_a' },
      })
      expect(result.isError).toBe(true)
      expect(JSON.stringify(result)).toContain('scene_changed')
      expect(JSON.stringify(bridge.getNodes())).toBe(before)
      expect(bridge.getActiveScene()?.[field]).toBe('changed')
    } finally {
      await client.close()
      await server.close()
    }
  },
)
