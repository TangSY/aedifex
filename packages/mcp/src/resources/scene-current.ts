import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { SceneOperations } from '../operations'

/**
 * `aedifex://scene/current` — full `{ nodes, rootNodeIds, collections }` snapshot.
 *
 * Static URI (not a template). MIME `application/json`.
 */
export function registerSceneCurrent(server: McpServer, bridge: SceneOperations): void {
  server.registerResource(
    'scene-current',
    'aedifex://scene/current',
    {
      title: 'Current scene',
      description:
        'Complete snapshot of the live Aedifex scene: nodes dict, rootNodeIds, collections.',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(bridge.exportJSON()),
        },
      ],
    }),
  )
}
