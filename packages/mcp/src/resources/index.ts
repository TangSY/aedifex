import type { McpServer } from '@modelcontextprotocol/server'
import type { SceneOperations } from '../operations'
import type { AssetCatalog } from '../tools/asset-catalog'
import { registerAgentGuide } from './agent-guide'
import { registerCatalogItems } from './catalog-items'
import { registerConstraints } from './constraints'
import { registerDesignSchema } from './design-schema'
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
 * - `aedifex://schema/design`          — application/json, design contract for validate_design
 * - `aedifex://agent-guide`            — text/markdown, MCP-first agent guide
 * - `aedifex://agent/guide`            — text/markdown, legacy alias
 */
export function registerResources(
  server: McpServer,
  operations: SceneOperations,
  catalog?: AssetCatalog,
): void {
  registerAgentGuide(server, operations)
  registerSceneCurrent(server, operations)
  registerSceneSummary(server, operations)
  registerCatalogItems(server, operations, catalog)
  registerConstraints(server, operations)
  registerDesignSchema(server, operations)
}
