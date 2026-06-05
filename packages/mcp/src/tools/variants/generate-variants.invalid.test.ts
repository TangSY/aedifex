import { beforeEach, describe, expect, test } from 'bun:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { SceneGraph } from '@aedifex/core/clone-scene-graph'
import type { AnyNodeId } from '@aedifex/core/schema'
import { SceneBridge } from '../../bridge/scene-bridge'
import { createSceneOperations } from '../../operations'
import { InMemorySceneStore } from '../scene-lifecycle/test-utils'
import { registerGenerateVariants } from './generate-variants'

/**
 * Round-2 coverage: invalid-node detection in `countInvalidNodes`. When the
 * fork carries a node that does not validate against AnyNode, the tool must
 * raise an InternalError with the `variant_invalid` token rather than return
 * a silently-corrupt variant graph.
 */
describe('generate_variants — invalid-node detection', () => {
  let client: Client
  let bridge: SceneBridge

  beforeEach(async () => {
    bridge = new SceneBridge()
    bridge.setScene({}, [])
    bridge.loadDefault()
    const store = new InMemorySceneStore()
    const operations = createSceneOperations({ bridge, store })
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    registerGenerateVariants(server, operations)
    const [srvT, cliT] = InMemoryTransport.createLinkedPair()
    client = new Client({ name: 'test-client', version: '0.0.0' })
    await Promise.all([server.connect(srvT), client.connect(cliT)])
  })

  test('countInvalidNodes > 0 → InternalError "variant_invalid"', async () => {
    // Inject a wall node that has type='wall' (known discriminator) but is
    // missing the required `start` / `end` tuples. SceneBridge.setScene does
    // not validate, so this survives forkSceneGraph + applyMutation and is
    // caught by countInvalidNodes inside the tool.
    const base = bridge.exportJSON()
    const level = Object.values(base.nodes).find((n) => n.type === 'level')
    expect(level).toBeDefined()
    const broken: SceneGraph = {
      nodes: {
        ...base.nodes,
        wall_broken: {
          object: 'node',
          id: 'wall_broken',
          type: 'wall',
          // intentionally omitted: start, end
          parentId: level?.id ?? null,
          visible: true,
          metadata: {},
          thickness: 0.1,
          height: 2.5,
          children: [],
          frontSide: 'unknown',
          backSide: 'unknown',
        },
      } as unknown as SceneGraph['nodes'],
      rootNodeIds: base.rootNodeIds as AnyNodeId[],
    }
    bridge.setScene(broken.nodes, broken.rootNodeIds)

    const result = await client.callTool({
      name: 'generate_variants',
      arguments: { count: 1, vary: ['wall-thickness'], seed: 1 },
    })
    expect(result.isError).toBe(true)
    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text
    expect(text).toContain('variant_invalid')
  })
})
