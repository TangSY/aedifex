import { beforeEach, describe, expect, test } from 'bun:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SceneBridge } from '../../bridge/scene-bridge'
import { createSceneOperations } from '../../operations'
import type { SceneSaveOptions, SceneStore, SceneWithGraph } from '../../storage/types'
import { registerCreateProject } from './create-project'
import {
  createTestSceneOperations,
  InMemorySceneStore,
  parseToolText,
  type StoredTextContent,
} from './test-utils'

async function makeClient(register: (server: McpServer) => void): Promise<Client> {
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  register(server)
  const [srvT, cliT] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test-client', version: '0.0.0' })
  await Promise.all([server.connect(srvT), client.connect(cliT)])
  return client
}

describe('create_project', () => {
  let client: Client
  let bridge: SceneBridge

  beforeEach(async () => {
    bridge = new SceneBridge()
    bridge.loadDefault()
    const { operations } = createTestSceneOperations({ bridge, store: new InMemorySceneStore() })
    client = await makeClient((srv) => registerCreateProject(srv, operations))
  })

  test('creates a project with a generated id and binds it to the bridge active scene', async () => {
    const result = await client.callTool({
      name: 'create_project',
      arguments: { name: 'New' },
    })
    expect(result.isError).toBeFalsy()
    const parsed = parseToolText(result.content as StoredTextContent[])
    expect(parsed.name).toBe('New')
    expect(typeof parsed.id).toBe('string')
    expect(parsed.projectId).toBe(parsed.id)
    expect(parsed.editorUrl).toBe(`/editor/${parsed.id}`)
    expect(parsed.isEmpty).toBe(true)
    expect(parsed.nextStep).toContain('save_scene')
    // Bridge's active scene should now be bound to the created project.
    const active = bridge.getActiveScene()
    expect(active).not.toBeNull()
    expect(active!.id).toBe(parsed.id as string)
  })

  test('honors an explicit id', async () => {
    const result = await client.callTool({
      name: 'create_project',
      arguments: { id: 'my-house', name: 'My House' },
    })
    expect(result.isError).toBeFalsy()
    const parsed = parseToolText(result.content as StoredTextContent[])
    expect(parsed.id).toBe('my-house')
    expect(parsed.projectId).toBe('my-house')
  })

  test('rejects an empty name through input validation', async () => {
    const result = await client.callTool({
      name: 'create_project',
      arguments: { name: '' },
    })
    expect(result.isError).toBe(true)
  })

  test('returns nextStep referencing save_scene and saveMode:"checkpoint" hint', async () => {
    const result = await client.callTool({
      name: 'create_project',
      arguments: { name: 'NextStep' },
    })
    const parsed = parseToolText(result.content as StoredTextContent[])
    expect(typeof parsed.nextStep).toBe('string')
    expect(parsed.nextStep as string).toContain('save_scene')
    expect(parsed.nextStep as string).toContain('checkpoint')
  })
})

describe('create_project — error when store cannot create projects', () => {
  test('returns isError when canCreateProject is false', async () => {
    // Build a store that does NOT implement createProject — operations.canCreateProject
    // becomes false, and the tool returns an MCP error.
    const minimalStore: SceneStore = {
      backend: 'sqlite',
      async save(opts: SceneSaveOptions) {
        return {
          id: opts.id ?? 'noop',
          name: opts.name,
          projectId: null,
          thumbnailUrl: null,
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ownerId: null,
          sizeBytes: 0,
          nodeCount: 0,
          editorUrl: '/editor/noop',
          url: '/editor/noop',
          published: true,
        }
      },
      async load(): Promise<SceneWithGraph | null> {
        return null
      },
      async list() {
        return []
      },
      async delete() {
        return false
      },
      async rename() {
        throw new Error('not implemented')
      },
    }
    const bridge = new SceneBridge()
    bridge.loadDefault()
    const operations = createSceneOperations({ bridge, store: minimalStore })
    expect(operations.canCreateProject).toBe(false)

    const client = await makeClient((srv) => registerCreateProject(srv, operations))
    const result = await client.callTool({
      name: 'create_project',
      arguments: { name: 'X' },
    })
    expect(result.isError).toBe(true)
  })
})
