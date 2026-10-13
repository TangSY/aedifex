import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { ROOM_TOOL_CONTRACTS } from '../agent-tools/room-structure'
import { applySceneChanges } from './apply-changes'
import { applyAgentOutcome } from './apply-outcome'
import { mezzanineFixture } from '../lib/__fixtures__/mezzanine'
import { type AnyNode, ItemNode } from '../schema'
import { ROOM_OPERATIONS } from './room-structure'

describe('shared structure operations', () => {
  test('every listed structure contract has a planner on every surface', () => {
    expect(ROOM_TOOL_CONTRACTS.map((contract) => contract.name).sort()).toEqual(
      Object.keys(ROOM_OPERATIONS).sort(),
    )
    expect(ROOM_TOOL_CONTRACTS).toHaveLength(14)
    const rotation = ROOM_TOOL_CONTRACTS.find((contract) => contract.name === 'rotate_zone')!
    expect(() => z.object(rotation.input).parse({ zoneId: 'zone_room', quarterTurns: 2 })).toThrow()
  })

  test('copy reconciles ceiling fixtures through the supplied mutation executor', () => {
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
    const plan = ROOM_OPERATIONS.duplicate_zone(
      nodes,
      {
        zoneId: fixture.host.id,
        translate: [10, 0],
      },
      { activeLevelId: null },
    )
    expect(nodes).toBe(before)
    let mutationBatches = 0
    const result = applyAgentOutcome(plan, {
      getNodes: () => nodes,
      applyChanges: (changes) => {
        mutationBatches++
        nodes = applySceneChanges(nodes, changes)
      },
      reconcile: () => {
        nodes = fixture.reconcile(nodes).nodes
      },
    })
    expect(mutationBatches).toBe(2)
    const copiedLightId = (result.idMap as Record<string, string[]>)[light.id]![0]!
    const copiedCeiling = Object.values(nodes).find(
      (node) => node.type === 'ceiling' && node.zoneId === result.zoneId,
    )!
    expect(nodes[copiedLightId]).toMatchObject({
      parentId: copiedCeiling.id,
      position: [12, -0.1, 2],
    })
    expect(nodes[light.id]).toEqual(light)
  })

  test('an out-of-host mezzanine refuses without invoking mutation', () => {
    const fixture = mezzanineFixture()
    const before = fixture.before
    const outcome = ROOM_OPERATIONS.create_mezzanine(
      before,
      {
        hostZoneId: fixture.host.id,
        polygon: [
          [-1, 1],
          [3, 1],
          [3, 3],
          [-1, 3],
        ],
      },
      { activeLevelId: null },
    )
    const unexpected = () => {
      throw Error('Refused plans must not mutate.')
    }
    const result = applyAgentOutcome(outcome, {
      getNodes: () => before,
      applyChanges: unexpected,
      reconcile: unexpected,
    })
    expect(result).toMatchObject({ changes: 0, conflicts: [{ code: 'outside-host' }] })
  })
})
