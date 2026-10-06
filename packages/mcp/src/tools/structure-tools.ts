import { applyStructureOperation, STRUCTURE_OPERATIONS } from '@aedifex/core/agent-operations'
import { STRUCTURE_TOOL_CONTRACTS } from '@aedifex/core/agent-tools'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { SceneOperations } from '../operations'
import { ADDITIVE_TOOL_ANNOTATIONS, DESTRUCTIVE_TOOL_ANNOTATIONS } from './annotations'
import { liveSyncOutput, persistencePayload, publishLiveSceneSnapshot } from './live-sync'

export {
  createMezzanineInput,
  cutFloorOpeningInput,
  deleteZoneInput,
  divideZoneInput,
  duplicateZoneInput,
  lockOutsideFacesInput,
  mergeZonesInput,
  moveZoneInput,
  rotateZoneInput,
  setZoneIntentInput,
} from '@aedifex/core/agent-tools'

export const structureOutput = {
  zoneId: z.string().optional(),
  openingId: z.string().optional(),
  openingIds: z.array(z.string()).optional(),
  hints: z
    .array(
      z.object({
        code: z.literal('manual-ceiling'),
        openingId: z.string(),
        surfaceIds: z.array(z.string()),
        message: z.string(),
      }),
    )
    .optional(),
  idMap: z.record(z.string(), z.array(z.string())).optional(),
  changes: z.number(),
  separatorId: z.string().optional(),
  separatorIds: z.array(z.string()).optional(),
  zoneIds: z.tuple([z.string(), z.string()]).optional(),
  payload: z
    .object({
      zoneId: z.string(),
      name: z.string(),
      mode: z.enum(['delete', 'merge', 'blocked']),
      mergedIntoZoneId: z.string().optional(),
      contents: z.enum(['delete', 'keep']),
      wallIds: z.array(z.string()),
      keptSharedWallIds: z.array(z.string()),
      separatorIds: z.array(z.string()),
      keptSharedSeparatorIds: z.array(z.string()),
      openingIds: z.array(z.string()),
      itemIds: z.array(z.string()),
      opensZoneIds: z.array(z.string()),
    })
    .optional(),
  conflicts: z
    .array(z.object({ code: z.string(), nodeIds: z.array(z.string()), message: z.string() }))
    .optional(),
  ...liveSyncOutput,
}

export function registerStructureTools(server: McpServer, bridge: SceneOperations) {
  for (const contract of STRUCTURE_TOOL_CONTRACTS) {
    server.registerTool(
      contract.name,
      {
        title: contract.title,
        description: contract.description,
        inputSchema: contract.input,
        outputSchema: structureOutput,
        annotations: contract.destructive
          ? DESTRUCTIVE_TOOL_ANNOTATIONS
          : ADDITIVE_TOOL_ANNOTATIONS,
      },
      async (input: Record<string, unknown>) => {
        const plan = STRUCTURE_OPERATIONS[contract.name](bridge.getNodes(), input as never)
        const force = input.force === true
        const result = applyStructureOperation({
          plan,
          force,
          runtime: {
            getNodes: () => bridge.getNodes(),
            applyChanges: (changes) =>
              bridge.applyPatch(
                changes.map((change) =>
                  change.op === 'create'
                    ? { ...change, parentId: change.node.parentId as never }
                    : change,
                ),
              ),
            reconcile: () => {
              bridge.deriveStructure()
            },
            runAsSingleHistoryStep: (run) => bridge.runAsSingleHistoryStep(run),
          },
        })
        const payload = {
          ...result,
          ...((plan.conflicts?.length && !force) || !plan.changes.length
            ? {}
            : persistencePayload(await publishLiveSceneSnapshot(bridge, contract.name))),
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
          structuredContent: payload,
        }
      },
    )
  }
}
