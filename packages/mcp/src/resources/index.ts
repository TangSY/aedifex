import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { SceneOperations } from '../operations'
import { registerAgentGuide } from './agent-guide'
import { registerCatalogItems } from './catalog-items'
import { registerConstraints } from './constraints'
import { registerSceneCurrent } from './scene-current'
import { registerSceneSummary } from './scene-summary'

/**
 * Registers all MCP resources exposed by `@aedifex/mcp`.
 *
 * Resources:
 * - `aedifex://scene/current`          — application/json, full snapshot
 * - `aedifex://scene/current/summary`  — text/markdown, human summary
 * - `aedifex://catalog/items`          — application/json, host-supplied catalog
 * - `aedifex://constraints/{levelId}`  — application/json, per-level constraints
 * - `aedifex://agent-guide`            — text/markdown, MCP-first agent guide
 * - `aedifex://agent/guide`            — text/markdown, legacy alias
 */
export function registerResources(server: McpServer, operations: SceneOperations): void {
  registerAgentGuide(server, operations)
  registerSceneCurrent(server, operations)
  registerSceneSummary(server, operations)
  registerCatalogItems(server, operations)
  registerConstraints(server, operations)
}
