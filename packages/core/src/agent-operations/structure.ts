import {
  applyZoneTransformPlan,
  createMezzanine,
  cutFloorOpening,
  type DeleteZonePayload,
  deleteZone,
  divideZone,
  duplicateZone,
  type HostedZoneTransformPlan,
  lockOutsideFaces,
  mergeZones,
  type NodeChange,
  rebaseFloorReference,
  removeFloorOpening,
  rotateZone,
  setFloorFoundation,
  setRoomFloorConstruction,
  setZoneIntent,
  transformZone,
} from '../commands/structure'
import { containsPoint } from '../lib/polygon-boolean'
import type { AnyNode } from '../schema'
import { generateId } from '../schema/base'
import type { SceneNodes } from './types'

export const STRUCTURE_OPERATIONS = {
  cut_floor_opening: (
    nodes: SceneNodes,
    input: Omit<Parameters<typeof cutFloorOpening>[1], 'mintId'>,
  ) => cutFloorOpening(nodes, { ...input, mintId: generateId }),
  remove_floor_opening: (nodes: SceneNodes, input: { id: string }) =>
    removeFloorOpening(nodes, input.id),
  set_floor_foundation: setFloorFoundation,
  set_room_floor_construction: setRoomFloorConstruction,
  rebase_floor_reference: rebaseFloorReference,
  create_mezzanine: (
    nodes: SceneNodes,
    input: Omit<Parameters<typeof createMezzanine>[1], 'mintId'>,
  ) => createMezzanine(nodes, { ...input, mintId: generateId }),
  move_zone: (nodes: SceneNodes, input: Omit<Parameters<typeof transformZone>[1], 'mintId'>) =>
    transformZone(nodes, { ...input, mintId: generateId }),
  duplicate_zone: (nodes: SceneNodes, input: Omit<Parameters<typeof duplicateZone>[1], 'mintId'>) =>
    duplicateZone(nodes, { ...input, mintId: generateId }),
  rotate_zone: (nodes: SceneNodes, input: Omit<Parameters<typeof rotateZone>[1], 'mintId'>) =>
    rotateZone(nodes, { ...input, mintId: generateId }),
  lock_outside_faces: (nodes: SceneNodes, input: { levelId?: string; zoneIds?: string[] }) => {
    if (Boolean(input.levelId) === Boolean(input.zoneIds))
      throw Error('Supply either levelId or zoneIds.')
    return lockOutsideFaces(
      nodes,
      input.levelId ? { levelId: input.levelId } : { zoneIds: input.zoneIds! },
    )
  },
  set_zone_intent: setZoneIntent,
  divide_zone: (nodes: SceneNodes, input: Omit<Parameters<typeof divideZone>[1], 'mintId'>) =>
    divideZone(nodes, { ...input, mintId: generateId }),
  merge_zones: mergeZones,
  delete_zone: deleteZone,
} as const

export type StructureToolName = keyof typeof STRUCTURE_OPERATIONS
export type StructureOperationPlan = HostedZoneTransformPlan & {
  separatorId?: string
  separatorIds?: string[]
  payload?: DeleteZonePayload
  zoneId?: string
  openingId?: string
  openingIds?: string[]
  hints?: Array<{
    code: 'manual-ceiling'
    openingId: string
    surfaceIds: string[]
    message: string
  }>
}

/** Parent links are maintained by create/delete/reparent, never by agent-authored children. */
function guardedStructureChanges(changes: NodeChange[]): NodeChange[] {
  return changes.flatMap((change) => {
    if (change.op !== 'update' || !Object.hasOwn(change.data, 'children')) return [change]
    const { children: _children, ...data } = change.data as Partial<AnyNode> & {
      children?: unknown
    }
    return Object.keys(data).length ? [{ ...change, data: data as Partial<AnyNode> }] : []
  })
}

/** Use the surface's existing guarded mutation executor; no storage is owned here. */
export function applyStructureOperation({
  plan,
  runtime,
  force = false,
}: {
  plan: StructureOperationPlan
  runtime: {
    getNodes: () => SceneNodes
    applyChanges: (changes: NodeChange[]) => void
    reconcile: () => void
    runAsSingleHistoryStep: (run: () => void) => void
  }
  force?: boolean
}) {
  let plannedZone = plan.zoneId ? runtime.getNodes()[plan.zoneId] : undefined
  for (const change of plan.changes) {
    if (change.op === 'create' && change.node.id === plan.zoneId) plannedZone = change.node
    else if (change.op === 'update' && change.id === plan.zoneId && plannedZone?.type === 'zone')
      plannedZone = { ...plannedZone, ...change.data } as typeof plannedZone
  }
  if (plan.changes.length && (!plan.conflicts?.length || force))
    runtime.runAsSingleHistoryStep(() =>
      applyZoneTransformPlan(plan, {
        getNodes: () => runtime.getNodes(),
        applyChanges: (changes) => runtime.applyChanges(guardedStructureChanges(changes)),
        reconcile: () => {
          runtime.reconcile()
        },
      }),
    )
  const zoneIds =
    plan.separatorIds?.length && !plan.conflicts?.length
      ? Object.values(runtime.getNodes())
          .filter(
            (node) =>
              node.type === 'zone' &&
              plan.separatorIds!.some((id) => node.boundarySeparatorIds.includes(id)),
          )
          .map((node) => node.id)
          .sort()
      : undefined
  let resultZoneId = plan.zoneId
  if (
    plan.changes.length &&
    resultZoneId &&
    !runtime.getNodes()[resultZoneId] &&
    plannedZone?.type === 'zone' &&
    plannedZone.seed
  ) {
    const { seed, parentId } = plannedZone
    resultZoneId =
      Object.values(runtime.getNodes()).find(
        (node) =>
          node.type === 'zone' &&
          node.parentId === parentId &&
          containsPoint([{ outer: node.polygon, holes: node.holes }], seed),
      )?.id ?? resultZoneId
  }
  const idMap =
    plan.idMap &&
    Object.fromEntries(
      Object.entries(plan.idMap).map(([id, targets]) => [
        id,
        targets.map((target) => (target === plan.zoneId ? resultZoneId! : target)),
      ]),
    )
  const payload = {
    changes: plan.changes.length,
    ...(resultZoneId ? { zoneId: resultZoneId } : {}),
    ...(plan.openingId ? { openingId: plan.openingId } : {}),
    ...(plan.openingIds ? { openingIds: plan.openingIds } : {}),
    ...(plan.hints ? { hints: plan.hints } : {}),
    ...(idMap ? { idMap } : {}),
    ...(zoneIds ? { zoneIds } : {}),
    ...(plan.payload ? { payload: plan.payload } : {}),
    ...(plan.separatorId ? { separatorId: plan.separatorId } : {}),
    ...(plan.separatorIds ? { separatorIds: plan.separatorIds } : {}),
    ...(plan.conflicts ? { conflicts: plan.conflicts } : {}),
  }
  return payload
}
