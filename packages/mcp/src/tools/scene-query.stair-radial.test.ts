import { beforeEach, describe, expect, test } from 'bun:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  DoorNode,
  LevelNode,
  SlabNode,
  StairNode,
  WallNode,
  WindowNode,
} from '@aedifex/core/schema'
import { SceneBridge } from '../bridge/scene-bridge'
import { registerSceneQueryTools } from './scene-query'

/**
 * Round-2 coverage for the parts of verify_scene that the existing
 * scene-query.test.ts does not touch:
 *   - the 24-vertex disc obstruction check for stairType `curved` / `spiral`
 *   - the door/window vertical-bound tolerance boundary (exactly at wall height
 *     must NOT emit an "exceeds wall height" issue).
 */
describe('verify_scene — radial stair + opening bounds (round-2)', () => {
  let client: Client
  let bridge: SceneBridge

  beforeEach(async () => {
    bridge = new SceneBridge()
    bridge.setScene({}, [])
    bridge.loadDefault()
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    registerSceneQueryTools(server, bridge)
    const [srvT, cliT] = InMemoryTransport.createLinkedPair()
    client = new Client({ name: 'test-client', version: '0.0.0' })
    await Promise.all([server.connect(srvT), client.connect(cliT)])
  })

  test('curved stair (24-vertex disc) reports a wall obstruction across the footprint', async () => {
    const building = Object.values(bridge.getNodes()).find((n) => n.type === 'building')!
    const ground = Object.values(bridge.getNodes()).find((n) => n.type === 'level')!
    // Need a destination level so the destination-opening check can also run.
    const upper = LevelNode.parse({ name: 'Upper', level: 1 })
    bridge.createNode(upper, building.id)

    // Wall passing right through the disc footprint (-2..+2 around stair @ [0,0]).
    bridge.createNode(
      WallNode.parse({ name: 'Through Wall', start: [-2, 0], end: [2, 0] }),
      ground.id,
    )

    const stair = StairNode.parse({
      name: 'Curved Stair',
      stairType: 'curved',
      position: [0, 0, 0],
      width: 1.0,
      innerRadius: 0.9,
      fromLevelId: ground.id,
      toLevelId: upper.id,
    })
    bridge.createNode(stair, ground.id)

    const result = await client.callTool({ name: 'verify_scene', arguments: {} })
    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0]!.text)
    const issuesJoined = parsed.issues.join('\n')
    expect(issuesJoined).toContain('obstructs stair Curved Stair')
  })

  test('spiral stair: disc-based footprint still triggers the obstruction check', async () => {
    const ground = Object.values(bridge.getNodes()).find((n) => n.type === 'level')!
    bridge.createNode(
      WallNode.parse({ name: 'Across', start: [-3, 0.5], end: [3, 0.5] }),
      ground.id,
    )
    const spiral = StairNode.parse({
      name: 'Spiral Stair',
      stairType: 'spiral',
      position: [0, 0, 0],
      width: 1.2,
      innerRadius: 0.6,
    })
    bridge.createNode(spiral, ground.id)

    const result = await client.callTool({ name: 'verify_scene', arguments: {} })
    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0]!.text)
    expect(parsed.issues.join('\n')).toContain('obstructs stair Spiral Stair')
  })

  test('curved stair sitting on its slab does NOT trigger "extends outside source floor slab"', async () => {
    const ground = Object.values(bridge.getNodes()).find((n) => n.type === 'level')!
    // Slab big enough to contain the 24-vertex disc (radius ~1.9) at origin.
    bridge.createNode(
      SlabNode.parse({
        polygon: [
          [-3, -3],
          [3, -3],
          [3, 3],
          [-3, 3],
        ],
      }),
      ground.id,
    )

    bridge.createNode(
      StairNode.parse({
        name: 'Curved On Slab',
        stairType: 'curved',
        position: [0, 0, 0],
        width: 1.0,
        innerRadius: 0.9,
      }),
      ground.id,
    )

    const result = await client.callTool({ name: 'verify_scene', arguments: {} })
    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0]!.text)
    expect(parsed.issues.join('\n')).not.toContain('Curved On Slab footprint extends outside')
  })

  test('door vertical top exactly == wall height does NOT trigger "exceed wall height" tolerance', async () => {
    const level = Object.values(bridge.getNodes()).find((n) => n.type === 'level')!
    const wall = WallNode.parse({ start: [0, 0], end: [4, 0], height: 2.5 })
    bridge.createNode(wall, level.id)
    // Position the door so top = 2.5 exactly. position[1] is door center;
    // height 2.0 → bottom 0.5, top 2.5 (== wall height, on the boundary).
    const door = DoorNode.parse({
      wallId: wall.id,
      position: [2, 1.5, 0],
      width: 0.9,
      height: 2.0,
    })
    bridge.createNode(door, wall.id)

    const result = await client.callTool({ name: 'verify_scene', arguments: {} })
    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0]!.text)
    const verticalIssues = (parsed.issues as string[]).filter((s) =>
      s.includes('vertical bounds'),
    )
    expect(verticalIssues).toEqual([])
  })

  test('window with top exactly == wall height + bottom == 0 sits on boundary, no issue', async () => {
    const level = Object.values(bridge.getNodes()).find((n) => n.type === 'level')!
    const wall = WallNode.parse({ start: [0, 0], end: [4, 0], height: 2.5 })
    bridge.createNode(wall, level.id)
    // height 2.5, center 1.25 → bottom 0, top 2.5.
    const window = WindowNode.parse({
      wallId: wall.id,
      position: [2, 1.25, 0],
      width: 1.0,
      height: 2.5,
    })
    bridge.createNode(window, wall.id)

    const result = await client.callTool({ name: 'verify_scene', arguments: {} })
    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0]!.text)
    const verticalIssues = (parsed.issues as string[]).filter((s) =>
      s.includes('vertical bounds'),
    )
    expect(verticalIssues).toEqual([])
  })

  test('window with top just past wall height DOES trigger "exceed wall height"', async () => {
    // Confirms the tolerance window only forgives the exact boundary.
    const level = Object.values(bridge.getNodes()).find((n) => n.type === 'level')!
    const wall = WallNode.parse({ start: [0, 0], end: [4, 0], height: 2.5 })
    bridge.createNode(wall, level.id)
    // height 2.5, center 1.5 → top 2.75 > 2.5 + 0.01 tolerance.
    const window = WindowNode.parse({
      wallId: wall.id,
      position: [2, 1.5, 0],
      width: 1.0,
      height: 2.5,
    })
    bridge.createNode(window, wall.id)

    const result = await client.callTool({ name: 'verify_scene', arguments: {} })
    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0]!.text)
    expect(parsed.issues.join('\n')).toContain('vertical bounds')
  })
})
