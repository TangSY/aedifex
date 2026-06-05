import { describe, expect, test } from 'bun:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { CreateMessageRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { SceneBridge } from '../../bridge/scene-bridge'
import { createSceneOperations } from '../../operations'
import { InMemorySceneStore } from '../scene-lifecycle/test-utils'
import { registerPhotoToScene } from './photo-to-scene'

type Handler = (req: unknown) => unknown | Promise<unknown>

async function makeWiredPair(opts: { samplingHandler: Handler }): Promise<{
  client: Client
  bridge: SceneBridge
  store: InMemorySceneStore
}> {
  const bridge = new SceneBridge()
  bridge.setScene({}, [])
  const store = new InMemorySceneStore()
  const operations = createSceneOperations({ bridge, store })
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  registerPhotoToScene(server, operations)
  const [srvT, cliT] = InMemoryTransport.createLinkedPair()
  const client = new Client(
    { name: 'test-client', version: '0.0.0' },
    { capabilities: { sampling: {} } },
  )
  client.setRequestHandler(
    CreateMessageRequestSchema,
    async (request) => (await opts.samplingHandler(request)) as never,
  )
  await Promise.all([server.connect(srvT), client.connect(cliT)])
  return { client, bridge, store }
}

/**
 * Round-2 coverage: every error branch on the vision → scene path that the
 * happy-path tests in photo-to-scene.test.ts skip.
 */
describe('photo_to_scene — invalid vision responses', () => {
  test('valid JSON but missing required fields → sampling_response_invalid', async () => {
    const { client } = await makeWiredPair({
      // Missing approximateDimensions + confidence → VisionResponseSchema.safeParse fails.
      samplingHandler: () => ({
        model: 'mock-model',
        role: 'assistant',
        content: {
          type: 'text',
          text: JSON.stringify({
            walls: [],
            rooms: [],
          }),
        },
      }),
    })
    const result = await client.callTool({
      name: 'photo_to_scene',
      arguments: { image: 'aGVsbG8=' },
    })
    expect(result.isError).toBe(true)
    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text
    expect(text).toContain('sampling_response_invalid')
  })

  test('confidence out of range (>1) → sampling_response_invalid', async () => {
    const { client } = await makeWiredPair({
      samplingHandler: () => ({
        model: 'mock-model',
        role: 'assistant',
        content: {
          type: 'text',
          text: JSON.stringify({
            walls: [],
            rooms: [],
            approximateDimensions: { widthM: 5, depthM: 4 },
            confidence: 1.7,
          }),
        },
      }),
    })
    const result = await client.callTool({
      name: 'photo_to_scene',
      arguments: { image: 'aGVsbG8=' },
    })
    expect(result.isError).toBe(true)
    expect((result.content as Array<{ type: string; text: string }>)[0]!.text).toContain(
      'sampling_response_invalid',
    )
  })

  test('reply has no text content blocks → sampling_response_unparseable', async () => {
    const { client } = await makeWiredPair({
      // Only an image block, no text.
      samplingHandler: () => ({
        model: 'mock-model',
        role: 'assistant',
        content: { type: 'image', data: 'AAAA', mimeType: 'image/png' },
      }),
    })
    const result = await client.callTool({
      name: 'photo_to_scene',
      arguments: { image: 'aGVsbG8=' },
    })
    expect(result.isError).toBe(true)
    expect((result.content as Array<{ type: string; text: string }>)[0]!.text).toContain(
      'sampling_response_unparseable',
    )
  })

  test('empty walls + rooms still saves a valid skeleton (site/building/level only)', async () => {
    const { client, bridge, store } = await makeWiredPair({
      samplingHandler: () => ({
        model: 'mock-model',
        role: 'assistant',
        content: {
          type: 'text',
          text: JSON.stringify({
            walls: [],
            rooms: [],
            approximateDimensions: { widthM: 1, depthM: 1 },
            confidence: 0.1,
          }),
        },
      }),
    })
    const result = await client.callTool({
      name: 'photo_to_scene',
      arguments: { image: 'aGVsbG8=', save: true },
    })
    expect(result.isError).toBeFalsy()
    const structured = result.structuredContent as {
      sceneId?: string
      walls: number
      rooms: number
    }
    expect(structured.walls).toBe(0)
    expect(structured.rooms).toBe(0)
    expect(typeof structured.sceneId).toBe('string')

    // Bridge swapped to a minimal site → building → level skeleton.
    const types = Object.values(bridge.getNodes()).map((n) => n.type)
    expect(types).toContain('site')
    expect(types).toContain('building')
    expect(types).toContain('level')

    const saved = await store.load(structured.sceneId!)
    expect(saved).not.toBeNull()
  })

  test('data: URI image parses through resolveImageBlock without throwing', async () => {
    let receivedMime = ''
    const { client } = await makeWiredPair({
      samplingHandler: (req) => {
        const r = req as {
          params: { messages: Array<{ content: Array<{ mimeType?: string }> }> }
        }
        const block = r.params.messages[0]!.content.find((c) => c.mimeType)
        receivedMime = block?.mimeType ?? ''
        return {
          model: 'mock-model',
          role: 'assistant',
          content: {
            type: 'text',
            text: JSON.stringify({
              walls: [],
              rooms: [],
              approximateDimensions: { widthM: 1, depthM: 1 },
              confidence: 0.5,
            }),
          },
        }
      },
    })
    const result = await client.callTool({
      name: 'photo_to_scene',
      arguments: {
        image: 'data:image/png;base64,AAAA',
        save: false,
      },
    })
    expect(result.isError).toBeFalsy()
    expect(receivedMime).toBe('image/png')
  })
})
