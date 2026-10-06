import { describe, expect, test } from 'bun:test'
import { addColumn } from '@aedifex/core/agent-operations'
import { type AnyNodeId, type CompiledGeometryScript, WallNode } from '@aedifex/core/schema'
import useScene from '@aedifex/core/store'
import { compileGeometryScript } from '@aedifex/geometry-script/compile'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { SceneBridge } from '../bridge/scene-bridge'
import { createAedifexMcpServer } from '../server'
import type { GeometryScriptHost } from './add-object'
import { toPatches } from './shared-tools'

const script = (mount: 'floor' | 'wall') => `
export const mount = '${mount}'
export const params = { width: 1, height: 1, depth: 0.2 }
export default function build({ THREE, params }) {
  return new THREE.Mesh(new THREE.BoxGeometry(params.width, params.height, params.depth), new THREE.MeshStandardMaterial())
}`

function memoryHost(): GeometryScriptHost {
  const artifacts = new Map<string, Uint8Array>()
  return {
    compile: async (input) => {
      const { glb, ...compiled } = await compileGeometryScript(input)
      return { ...compiled, glb: new Uint8Array(glb) }
    },
    storeArtifact: async ({ sha256, bytes }) => {
      artifacts.set(sha256, bytes)
    },
    readArtifact: async ({ sha256 }) => artifacts.get(sha256) ?? null,
  }
}

async function connected(
  input: {
    host?: GeometryScriptHost
    executeTool?: Parameters<typeof createAedifexMcpServer>[0]['executeTool']
  } = {},
) {
  const bridge = new SceneBridge()
  bridge.setScene({}, [])
  bridge.loadDefault()
  bridge.setActiveScene({
    id: 'script-scene',
    name: 'Script scene',
    version: 1,
    projectId: null,
    ownerId: null,
    thumbnailUrl: null,
  })
  const server = createAedifexMcpServer({
    bridge,
    geometryScripts: input.host ?? memoryHost(),
    executeTool: input.executeTool,
  })
  const client = new Client({ name: 'compiled-geometry-test', version: '1' })
  const [a, b] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(a), client.connect(b)])
  const call = async (name: string, args: Record<string, unknown>) =>
    client.callTool({ name, arguments: args })
  return {
    bridge,
    call,
    close: async () => {
      await client.close()
      await server.close()
    },
  }
}

function payload(result: Awaited<ReturnType<Client['callTool']>>) {
  expect(result.isError, JSON.stringify(result)).toBeFalsy()
  return result.structuredContent as Record<string, unknown>
}

describe('compiled geometry mutation boundary', () => {
  test('an authored object rebuilds from the real compiler; raw source updates still refuse', async () => {
    const f = await connected()
    try {
      const created = payload(
        await f.call('add_object', { code: script('floor'), params: { height: 1 } }),
      )
      const id = created.nodeId as AnyNodeId
      const old = f.bridge.getNode(id)!
      payload(await f.call('add_object', { nodeId: id, params: { height: 2 } }))
      const rebuilt = f.bridge.getNode(id)!
      expect(rebuilt.type === 'item' && rebuilt.asset.dimensions![1]).toBe(2)
      expect(rebuilt.source?.artifact).not.toBe(old.source?.artifact)
      const snapshot = f.bridge.getNodes()
      const raw = await f.call('apply_patch', {
        patches: [{ op: 'update', id, data: { source: old.source } }],
      })
      expect(raw.isError).toBe(true)
      expect(JSON.stringify(raw)).toContain('scripted_field')
      expect(f.bridge.getNodes()).toEqual(snapshot)
    } finally {
      await f.close()
    }
  })

  test('scripted windows, doors and columns rebuild to the compiled dimensions', async () => {
    const f = await connected()
    try {
      const level = Object.values(f.bridge.getNodes()).find((node) => node.type === 'level')!
      const wall = WallNode.parse({ start: [0, 0], end: [8, 0] })
      f.bridge.createNode(wall, level.id)
      for (const kind of ['window', 'door', 'column'] as const) {
        const created = payload(
          await f.call(
            `add_${kind}`,
            kind === 'column'
              ? { code: script('floor'), x: 2, z: 2 }
              : {
                  code: script('wall'),
                  wallId: wall.id,
                  position: kind === 'window' ? 0.25 : 0.75,
                },
          ),
        )
        const id = (created.nodeId ?? created[`${kind}Id`]) as AnyNodeId
        payload(await f.call(`add_${kind}`, { nodeId: id, params: { width: 1.2, height: 1.5 } }))
        const node = f.bridge.getNode(id)!
        expect(node).toMatchObject({ width: 1.2, height: 1.5 })
        const before = f.bridge.getNodes()
        expect(
          (await f.call('apply_patch', { patches: [{ op: 'update', id, data: { width: 4 } }] }))
            .isError,
        ).toBe(true)
        expect(f.bridge.getNodes()).toEqual(before)
      }
    } finally {
      await f.close()
    }
  })

  test('compiled updates keep identity, schema, deletion and material guards atomic', async () => {
    const f = await connected()
    try {
      const created = payload(await f.call('add_column', { code: script('floor'), x: 1, z: 1 }))
      const id = created.nodeId as AnyNodeId
      const compiled: CompiledGeometryScript = await compileGeometryScript({
        code: script('floor'),
        params: { height: 2 },
      })
      const outcome = addColumn(
        f.bridge.getNodes(),
        { nodeId: id, compiled },
        { activeLevelId: null },
      )
      const patches = toPatches(outcome.changes!)
      const good = patches[0]!
      if (good.op !== 'update') throw Error('Expected rebuild update')
      const building = Object.values(f.bridge.getNodes()).find((node) => node.type === 'building')!
      const snapshot = f.bridge.getNodes()
      for (const [fault, expected] of [
        [{ id: 'column_other' }, 'identity_change'],
        [{ width: 4 }, 'scripted_field'],
        [{ position: ['bad', 0, 0] }, 'invalid_update'],
        [{ materialPreset: 'unknown-finish' }, 'invalid_update'],
      ] as const) {
        expect(() =>
          f.bridge.applyCompiledGeometryPatch({
            compiled,
            patches: [{ ...good, data: { ...good.data, ...fault } as never }],
          }),
        ).toThrow(expected)
        expect(f.bridge.getNodes()).toEqual(snapshot)
      }
      expect(() =>
        f.bridge.applyCompiledGeometryPatch({
          compiled,
          patches: [...patches, { op: 'delete', id: building.id }],
        }),
      ).toThrow('not_deletable')
      expect(f.bridge.getNodes()).toEqual(snapshot)
      useScene.setState({ readOnly: true })
      try {
        expect(() => f.bridge.applyCompiledGeometryPatch({ compiled, patches })).toThrow(
          'scene_read_only',
        )
        expect(f.bridge.getNodes()).toEqual(snapshot)
      } finally {
        useScene.setState({ readOnly: false })
      }
    } finally {
      await f.close()
    }
  })

  test('changing scenes during compile refuses the result before any node write', async () => {
    const host = memoryHost()
    let switchScene: (() => void) | undefined
    const compile = host.compile
    host.compile = async (input) => {
      const result = await compile(input)
      switchScene!()
      return result
    }
    const f = await connected({ host })
    try {
      switchScene = () =>
        f.bridge.setActiveScene({ ...f.bridge.getActiveScene()!, id: 'other-scene' })
      const before = f.bridge.getNodes()
      const result = await f.call('add_object', { code: script('floor') })
      expect(result.isError).toBe(true)
      expect(JSON.stringify(result)).toContain('scene_changed_during_compile')
      expect(f.bridge.getNodes()).toEqual(before)
    } finally {
      await f.close()
    }
  })

  test('a denied tool executor never compiles or writes', async () => {
    const host = memoryHost()
    let compileCalls = 0
    const compile = host.compile
    host.compile = async (input) => {
      compileCalls++
      return compile(input)
    }
    const f = await connected({
      host,
      executeTool: async () => {
        throw Error('permission_denied')
      },
    })
    try {
      const before = f.bridge.getNodes()
      const result = await f.call('add_object', { code: script('floor') })
      expect(result.isError).toBe(true)
      expect(compileCalls).toBe(0)
      expect(f.bridge.getNodes()).toEqual(before)
    } finally {
      await f.close()
    }
  })
})
