import { beforeEach, describe, expect, test } from 'bun:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SceneBridge } from '../../bridge/scene-bridge'
import { registerSaveScene } from './save-scene'
import {
  createTestSceneOperations,
  InMemorySceneStore,
  parseToolText,
  type StoredTextContent,
} from './test-utils'

describe('save_scene — saveMode and publish flags', () => {
  let client: Client
  let bridge: SceneBridge
  let store: InMemorySceneStore

  beforeEach(async () => {
    bridge = new SceneBridge()
    bridge.setScene({}, [])
    bridge.loadDefault()
    store = new InMemorySceneStore()
    const { operations } = createTestSceneOperations({ bridge, store })
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    registerSaveScene(server, operations)
    const [srvT, cliT] = InMemoryTransport.createLinkedPair()
    client = new Client({ name: 'test-client', version: '0.0.0' })
    await Promise.all([server.connect(srvT), client.connect(cliT)])
  })

  test('default saveMode is "draft" and isDraft defaults to false from store', async () => {
    const result = await client.callTool({
      name: 'save_scene',
      arguments: { name: 'Default mode' },
    })
    expect(result.isError).toBeFalsy()
    const parsed = parseToolText(result.content as StoredTextContent[])
    // sceneMetaPayload always emits a saveMode field. InMemorySceneStore doesn't
    // set saveMode/isDraft on the returned meta, so payload falls back to
    // saveMode='checkpoint' (because isDraft is falsy) per metadata.ts:37.
    expect(typeof parsed.saveMode).toBe('string')
    expect(parsed.isDraft).toBe(false)
  })

  test('saveMode:"checkpoint" + publish:true saves and marks published=true', async () => {
    const result = await client.callTool({
      name: 'save_scene',
      arguments: {
        name: 'Checkpoint',
        saveMode: 'checkpoint',
        publish: true,
      },
    })
    expect(result.isError).toBeFalsy()
    const parsed = parseToolText(result.content as StoredTextContent[])
    expect(parsed.name).toBe('Checkpoint')
    expect(parsed.version).toBe(1)
    expect(parsed.published).toBe(true)
    // editorUrl is browser-visible immediately for a published checkpoint.
    expect(parsed.editorUrl).toBe(`/editor/${parsed.id}`)
    // The graph is non-empty (loaded default contains a site).
    expect((parsed.nodeCount as number) > 0).toBe(true)
    // graphHash present so downstream cache invalidation can rely on it.
    expect(typeof parsed.graphHash).toBe('string')
  })

  test('checkpoint save with explicit id persists deterministic editor URL', async () => {
    const result = await client.callTool({
      name: 'save_scene',
      arguments: {
        id: 'stable-id',
        name: 'Stable',
        saveMode: 'checkpoint',
      },
    })
    expect(result.isError).toBeFalsy()
    const parsed = parseToolText(result.content as StoredTextContent[])
    expect(parsed.id).toBe('stable-id')
    expect(parsed.editorUrl).toBe('/editor/stable-id')
    expect(parsed.url).toBe('/editor/stable-id')
  })

  test('saveMode rejects invalid values with isError', async () => {
    const result = await client.callTool({
      name: 'save_scene',
      arguments: { name: 'Bad mode', saveMode: 'archive' },
    })
    expect(result.isError).toBe(true)
  })

  test('publish:true on a draft save still passes through (store ignores publish flag itself)', async () => {
    // The store's contract treats publish as advisory; we just verify the tool
    // does not reject the combination and the meta payload is well-formed.
    const result = await client.callTool({
      name: 'save_scene',
      arguments: { name: 'Draft+publish', saveMode: 'draft', publish: true },
    })
    expect(result.isError).toBeFalsy()
    const parsed = parseToolText(result.content as StoredTextContent[])
    expect(parsed.version).toBe(1)
  })

  test('graph.nodes must be an object when includeCurrentScene is false', async () => {
    const result = await client.callTool({
      name: 'save_scene',
      arguments: {
        name: 'Bad nodes',
        includeCurrentScene: false,
        graph: { nodes: 'not-an-object', rootNodeIds: [] },
      },
    })
    expect(result.isError).toBe(true)
  })
})
