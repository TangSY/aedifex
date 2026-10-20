import { expect, test } from 'bun:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { nodeRegistry, registerNode } from '@aedifex/core'
import { CabinetModuleNode, CabinetNode, LevelNode, WallNode } from '@aedifex/core/schema'
import { SceneBridge } from '@aedifex/mcp/bridge'
import { createSceneOperations } from '@aedifex/mcp/operations'
import { registerOperationTool } from '@aedifex/mcp/tools/shared-tools'
import { cabinetDefinition, cabinetModuleDefinition } from '@aedifex/nodes'
import { builtinAgentTools } from '@aedifex/nodes/agent-tools'
import { builtinAgentOperations } from './index'

// The kitchen tools as a host registers them: the plugin's contracts and operations, the host's
// annotations, through the shared-tool runner and a real client.
for (const action of ['fill', 'align'] as const) {
  test(`kitchen ${action}: shared operation and real MCP client agree and undo together`, async () => {
    const restore = nodeRegistry._snapshot()
    registerNode(cabinetDefinition)
    registerNode(cabinetModuleDefinition)
    const level = LevelNode.parse({})
    const run = CabinetNode.parse({ parentId: level.id, depth: 0.6, carcassHeight: 0.72 })
    const module = CabinetModuleNode.parse({
      parentId: run.id,
      width: 0.6,
      depth: 0.6,
      carcassHeight: 0.8,
      position: [0, 0.2, 0],
    })
    run.children = [module.id]
    const walls = [-0.5, 0.5].map((x) =>
      WallNode.parse({ parentId: level.id, start: [x, -1], end: [x, 1], thickness: 0.2 }),
    )
    level.children = [run.id, ...walls.map((wall) => wall.id)]
    const nodes = Object.fromEntries([level, run, module, ...walls].map((node) => [node.id, node]))
    const direct = builtinAgentOperations.kitchen_finish_run(
      nodes,
      { runId: run.id, action },
      { activeLevelId: null },
    )
    const bridge = new SceneBridge()
    bridge.setScene(nodes, [level.id])
    bridge.clearHistory()
    const server = new McpServer({ name: 'kitchen-test', version: '0.0.0' })
    const operations = createSceneOperations({ bridge })
    for (const contract of builtinAgentTools.tools) {
      if (contract.runsIn !== 'operation') continue
      registerOperationTool(server, operations, {
        contract,
        operation: builtinAgentOperations[contract.name]!,
        annotations: {
          readOnlyHint: contract.name === 'kitchen_check_clearance',
          destructiveHint: false,
          openWorldHint: false,
        },
      })
    }
    const client = new Client({ name: 'kitchen-test', version: '0.0.0' })
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
    try {
      const list = await client.listTools()
      expect(list.tools.find((tool) => tool.name === 'kitchen_finish_run')?.description).toBe(
        builtinAgentTools.tools[0]!.description,
      )
      const result = await client.callTool({
        name: 'kitchen_finish_run',
        arguments: { runId: run.id, action },
      })
      expect(result.isError, JSON.stringify(result.content)).not.toBe(true)
      const after = bridge.getNodes()
      if (action === 'fill') {
        expect(direct.changes?.create).toHaveLength(2)
        const runUpdate = direct.changes?.update?.find((entry) => entry.id === run.id)?.data
        expect(Object.keys(runUpdate ?? {})).toEqual(['width'])
        expect(runUpdate?.width).toBeCloseTo(0.8)
        expect(after[run.id]?.width).toBeCloseTo(0.8)
        expect(after[module.id]?.position).toEqual(module.position)
        const fillers = Object.values(after)
          .filter((node) => node.type === 'cabinet-module' && node.moduleKind === 'wall-filler')
          .sort((left, right) => left.position[0] - right.position[0])
        expect(fillers[0]?.position[0]).toBeCloseTo(-0.35)
        expect(fillers[1]?.position[0]).toBeCloseTo(0.35)
        expect(after[run.id]?.children).toHaveLength(3)
        expect(fillers).toHaveLength(2)
      } else {
        expect(after[module.id]?.carcassHeight).toBe(0.72)
        expect(after[module.id]?.position).toEqual([0, 0.1, 0])
        expect(direct.changes?.update?.find((entry) => entry.id === module.id)?.data).toMatchObject(
          { carcassHeight: 0.72 },
        )
      }
      const check = await client.callTool({
        name: 'kitchen_check_clearance',
        arguments: { nodeId: run.id },
      })
      expect(check.isError).not.toBe(true)
      bridge.undo()
      expect(bridge.getNodes()[run.id]?.children).toEqual([module.id])
      expect(bridge.getNodes()[module.id]?.carcassHeight).toBe(0.8)
      expect(bridge.getNodes()[module.id]?.position).toEqual(module.position)
      expect(bridge.getNodes()[run.id]?.width).toBe(run.width)
      const missing = await client.callTool({
        name: 'kitchen_finish_run',
        arguments: { runId: 'cabinet_missing', action },
      })
      expect(missing.isError).toBe(true)
      expect(JSON.stringify(missing.content)).toContain('cabinet_run_not_found')
    } finally {
      await client.close()
      await server.close()
      restore()
    }
  })
}
