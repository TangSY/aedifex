import { expect, test } from 'bun:test'
import {
  captureRegistryVersions,
  effectIds,
  openDetachedScene,
  type SceneSnapshot,
} from '@aedifex/core/runtime'
import { BuildingNode, LevelNode } from '@aedifex/core/schema'
import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { SceneBridge } from '../bridge/scene-bridge'
import { createAedifexMcpServer } from '../server'

async function setup(pause: (bridge: SceneBridge) => Promise<void>) {
  const level = LevelNode.parse({ id: 'level_pause', parentId: 'building_pause', level: 0 })
  const building = BuildingNode.parse({ id: 'building_pause', children: [level.id] })
  const bridge = new SceneBridge()
  bridge.setScene({ [building.id]: building, [level.id]: level }, [building.id])
  const server = createAedifexMcpServer({ bridge, betweenBatchCalls: () => pause(bridge) })
  const [a, b] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'batch-pause-test', version: '1' })
  await Promise.all([server.connect(a), client.connect(b)])
  const run = () =>
    client.callTool({
      name: 'run_batch',
      arguments: {
        calls: [
          { tool: 'add_wall', input: { start: [0, 0], end: [0, 3] } },
          { tool: 'add_wall', input: { start: [2, 0], end: [2, 3] } },
        ],
      },
    })
  const walls = () => Object.values(bridge.getNodes()).filter((node) => node.type === 'wall')
  return { bridge, client, run, walls }
}

test('a paused batch is applied once after all calls and undone as one step', async () => {
  const visible: number[] = []
  const host = await setup(async (bridge) => {
    await new Promise((resolve) => setTimeout(resolve, 0))
    visible.push(Object.values(bridge.getNodes()).filter((node) => node.type === 'wall').length)
  })
  try {
    const result = await host.run()
    expect(result.isError).toBeFalsy()
    expect(visible).toEqual([0, 0])
    expect(host.walls()).toHaveLength(2)
    expect(host.bridge.undo()).toBe(1)
    expect(host.walls()).toHaveLength(0)
  } finally {
    await host.client.close()
  }
})

test('a concurrent scene edit refuses the batch without losing that edit', async () => {
  let changed = false
  const host = await setup(async (bridge) => {
    if (changed) return
    changed = true
    bridge.applyPatch([{ op: 'update', id: 'level_pause', data: { name: 'User edit' } }])
  })
  try {
    const result = await host.run()
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result)).toContain('scene_changed')
    expect(host.walls()).toHaveLength(0)
    expect(host.bridge.getNode('level_pause')?.name).toBe('User edit')
  } finally {
    await host.client.close()
  }
})

test('an interrupted pause applies none of the planned calls', async () => {
  const host = await setup(async () => {
    throw new Error('pause_interrupted')
  })
  try {
    const result = await host.run()
    expect(result.isError).toBe(true)
    expect(host.walls()).toHaveLength(0)
  } finally {
    await host.client.close()
  }
})

test('a refusal after a pause keeps earlier planned writes out of the scene', async () => {
  let pauses = 0
  const host = await setup(async () => {
    pauses++
  })
  try {
    const result = await host.client.callTool({
      name: 'run_batch',
      arguments: {
        calls: [
          { tool: 'add_wall', input: { start: [0, 0], end: [0, 3] } },
          { tool: 'delete_node', input: { id: 'wall_missing' } },
        ],
      },
    })
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result)).toContain('batch_call_refused')
    expect(pauses).toBe(1)
    expect(host.walls()).toHaveLength(0)
  } finally {
    await host.client.close()
  }
})

test.each(['materials', 'collections', 'session'] as const)(
  'a concurrent %s change refuses the batch',
  async (kind) => {
    let changed = false
    const host = await setup(async (bridge) => {
      if (changed) return
      changed = true
      if (kind === 'materials')
        bridge.applyPatch([
          { op: 'upsert_material', material: { id: 'mat_pause', name: 'Paint', material: {} } },
        ])
      if (kind === 'collections')
        bridge.setCollections({
          collection_pause: { id: 'collection_pause', name: 'Group', nodeIds: [] },
        })
      if (kind === 'session')
        bridge.agentSession.keep({
          designBrief: {
            fixed: ['the requested pieces'],
            open: [],
            source: 'catalog',
            vision: 'The catalog as it is.',
            beyond: 'none: no dressing requested.',
          },
        })
    })
    try {
      const result = await host.run()
      expect(result.isError).toBe(true)
      expect(JSON.stringify(result)).toContain('scene_changed')
      expect(host.walls()).toHaveLength(0)
    } finally {
      await host.client.close()
    }
  },
)

test('pauses preserve detached scene ids and the final patch', async () => {
  async function run(paused: boolean) {
    const level = LevelNode.parse({ id: 'level_pause', parentId: 'building_pause', level: 0 })
    const building = BuildingNode.parse({ id: 'building_pause', children: [level.id] })
    const snapshot = {
      nodes: { [building.id]: building, [level.id]: level },
      rootNodeIds: [building.id],
      collections: {},
      materials: {},
      installedPlugins: [],
    } as SceneSnapshot
    const scene = openDetachedScene(snapshot, {
      base: { kind: 'authority', seq: 1 },
      context: {
        activeLevelId: level.id,
        selection: [],
        units: 'metric',
        catalogVersion: 'test',
        registryVersions: captureRegistryVersions(),
      },
      ids: effectIds('batch_pause_effect'),
    })
    const bridge = new SceneBridge({ runtime: scene })
    const server = createAedifexMcpServer({
      bridge,
      ...(paused
        ? {
            betweenBatchCalls: async () => {
              await Promise.resolve()
            },
          }
        : {}),
    })
    const [a, b] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'detached-batch', version: '1' })
    await Promise.all([server.connect(a), client.connect(b)])
    try {
      const result = await client.callTool({
        name: 'run_batch',
        arguments: {
          calls: [
            { tool: 'add_wall', input: { levelId: level.id, start: [0, 0], end: [0, 3] } },
            { tool: 'add_wall', input: { levelId: level.id, start: [2, 0], end: [2, 3] } },
          ],
        },
      })
      expect(result.isError, JSON.stringify(result.content)).toBeFalsy()
      return scene.patch()
    } finally {
      await client.close()
      await server.close()
      scene.dispose()
    }
  }
  const direct = await run(false)
  expect(direct.nodeCreates.filter(({ node }) => node.type === 'wall')).toHaveLength(2)
  expect(await run(true)).toEqual(direct)
})

test('a stepped scene check answers identically alone and inside a batch', async () => {
  async function run(paused: boolean, nested: boolean) {
    const level = LevelNode.parse({ id: 'level_verify', parentId: 'building_verify', level: 0 })
    const building = BuildingNode.parse({ id: 'building_verify', children: [level.id] })
    const bridge = new SceneBridge()
    bridge.setScene({ [building.id]: building, [level.id]: level }, [building.id])
    let pauses = 0
    const server = createAedifexMcpServer({
      bridge,
      ...(paused
        ? {
            betweenSteps: async () => {
              pauses++
            },
          }
        : {}),
    })
    const [a, b] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'verify-steps', version: '1' })
    await Promise.all([server.connect(a), client.connect(b)])
    try {
      const result = await client.callTool(
        nested
          ? { name: 'run_batch', arguments: { calls: [{ tool: 'verify_scene' }] } }
          : { name: 'verify_scene', arguments: {} },
      )
      expect(result.isError, JSON.stringify(result.content)).toBeFalsy()
      return { payload: result.structuredContent, pauses }
    } finally {
      await client.close()
      await server.close()
    }
  }
  for (const nested of [false, true]) {
    const direct = await run(false, nested)
    const stepped = await run(true, nested)
    expect(stepped.payload).toEqual(direct.payload)
    expect(stepped.pauses).toBeGreaterThan(2)
  }
})

test('a scene check interrupted by a concurrent edit returns no stale result', async () => {
  const level = LevelNode.parse({ id: 'level_verify', level: 0 })
  const bridge = new SceneBridge()
  bridge.setScene({ [level.id]: level }, [level.id])
  let edited = false
  const server = createAedifexMcpServer({
    bridge,
    betweenSteps: async () => {
      if (!edited) {
        edited = true
        bridge.updateNode(level.id, { name: 'Concurrent edit' })
      }
    },
  })
  const [a, b] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'verify-conflict', version: '1' })
  await Promise.all([server.connect(a), client.connect(b)])
  try {
    const result = await client.callTool({ name: 'verify_scene', arguments: {} })
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result)).toContain('scene_changed')
    expect(bridge.getNode(level.id)?.name).toBe('Concurrent edit')
  } finally {
    await client.close()
    await server.close()
  }
})

test.each(['scene version', 'root order', 'installed plugins'] as const)(
  'a paused batch rejects a change in %s',
  async (kind) => {
    const level = LevelNode.parse({ id: 'level_guard', parentId: 'building_guard', level: 0 })
    const building = BuildingNode.parse({ id: 'building_guard', children: [level.id] })
    const snapshot = {
      nodes: { [building.id]: building, [level.id]: level },
      rootNodeIds: [building.id],
      collections: {},
      materials: {},
      installedPlugins: [],
    } as SceneSnapshot
    const scene = openDetachedScene(snapshot, {
      base: { kind: 'authority', seq: 1 },
      context: {
        activeLevelId: level.id,
        selection: [],
        units: 'metric',
        catalogVersion: 'test',
        registryVersions: captureRegistryVersions(),
      },
      ids: effectIds('batch_guard_effect'),
    })
    const bridge = new SceneBridge({ runtime: scene })
    bridge.setActiveScene({ id: 'scene_guard', name: 'Scene', version: 1 })
    let changed = false
    const server = createAedifexMcpServer({
      bridge,
      betweenSteps: async () => {
        if (changed) return
        changed = true
        if (kind === 'scene version')
          bridge.setActiveScene({ id: 'scene_guard', name: 'Scene', version: 2 })
        if (kind === 'root order') scene.store.setState({ rootNodeIds: [level.id, building.id] })
        if (kind === 'installed plugins')
          scene.store.getState().setInstalledPlugins(['aedifex:test'])
      },
    })
    const [a, b] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'batch-context-guard', version: '1' })
    await Promise.all([server.connect(a), client.connect(b)])
    try {
      const result = await client.callTool({
        name: 'run_batch',
        arguments: {
          calls: [{ tool: 'add_wall', input: { levelId: level.id, start: [0, 0], end: [0, 3] } }],
        },
      })
      expect(result.isError).toBe(true)
      expect(JSON.stringify(result)).toContain('scene_changed')
      expect(Object.values(bridge.getNodes()).filter((node) => node.type === 'wall')).toHaveLength(
        0,
      )
    } finally {
      await client.close()
      await server.close()
      scene.dispose()
    }
  },
)
