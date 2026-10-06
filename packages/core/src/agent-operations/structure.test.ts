import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { STRUCTURE_TOOL_CONTRACTS } from '../agent-tools/structure'
import { applyToScratch, structureChangeBatch } from '../commands/structure/shared'
import { mezzanineFixture } from '../lib/__fixtures__/mezzanine'
import { type AnyNode, ItemNode } from '../schema'
import { applyStructureOperation, STRUCTURE_OPERATIONS } from './structure'

describe('shared structure operations', () => {
  test('every listed structure contract has a planner on every surface', () => {
    expect(STRUCTURE_TOOL_CONTRACTS.map((contract) => contract.name).sort()).toEqual(
      Object.keys(STRUCTURE_OPERATIONS).sort(),
    )
    expect(STRUCTURE_TOOL_CONTRACTS).toHaveLength(14)
    const rotation = STRUCTURE_TOOL_CONTRACTS.find((contract) => contract.name === 'rotate_zone')!
    expect(() => z.object(rotation.input).parse({ zoneId: 'zone_room', quarterTurns: 2 })).toThrow()
  })

  test('copy reconciles ceiling fixtures through the supplied mutation executor in one history step', () => {
    const fixture = mezzanineFixture()
    const ceiling = Object.values(fixture.before).find((node) => node.type === 'ceiling')!
    const light = ItemNode.parse({
      id: 'item_fixture',
      parentId: ceiling.id,
      position: [2, -0.1, 2],
      asset: {
        id: 'light',
        category: 'lighting',
        name: 'Light',
        thumbnail: '',
        src: 'asset://light',
      },
    })
    let nodes: Readonly<Record<string, AnyNode>> = { ...fixture.before, [light.id]: light }
    const before = nodes
    const plan = STRUCTURE_OPERATIONS.duplicate_zone(nodes, {
      zoneId: fixture.host.id,
      translate: [10, 0],
    })
    expect(nodes).toBe(before)
    let historySteps = 0
    let mutationBatches = 0
    const result = applyStructureOperation({
      plan,
      runtime: {
        getNodes: () => nodes,
        applyChanges: (changes) => {
          mutationBatches++
          nodes = applyToScratch(nodes, structureChangeBatch(changes))
        },
        reconcile: () => {
          nodes = fixture.reconcile(nodes).nodes
        },
        runAsSingleHistoryStep: (run) => {
          historySteps++
          run()
        },
      },
    })
    expect(historySteps).toBe(1)
    expect(mutationBatches).toBe(2)
    const copiedLightId = result.idMap![light.id]![0]!
    const copiedCeiling = Object.values(nodes).find(
      (node) => node.type === 'ceiling' && node.zoneId === result.zoneId,
    )!
    expect(nodes[copiedLightId]).toMatchObject({
      parentId: copiedCeiling.id,
      position: [12, -0.1, 2],
    })
    expect(nodes[light.id]).toEqual(light)
  })

  test('an out-of-host mezzanine refuses without invoking mutation or history', () => {
    const fixture = mezzanineFixture()
    const before = fixture.before
    const plan = STRUCTURE_OPERATIONS.create_mezzanine(before, {
      hostZoneId: fixture.host.id,
      polygon: [
        [-1, 1],
        [3, 1],
        [3, 3],
        [-1, 3],
      ],
    })
    const unexpected = () => {
      throw Error('Refused plans must not mutate.')
    }
    const result = applyStructureOperation({
      plan,
      runtime: {
        getNodes: () => before,
        applyChanges: unexpected,
        reconcile: unexpected,
        runAsSingleHistoryStep: unexpected,
      },
    })
    expect(result).toMatchObject({ changes: 0, conflicts: [{ code: 'outside-host' }] })
  })
})
