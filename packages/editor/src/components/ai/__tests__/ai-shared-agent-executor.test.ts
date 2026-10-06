import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  configureArtifactStore,
  GeometryArtifactManifest,
  nodeRegistry,
  useScene,
  WallNode,
} from '@aedifex/core'
import { AGENT_TOOL_CONTRACTS } from '@aedifex/core/agent-tools'
import { useViewer } from '@aedifex/viewer'
import { z } from 'zod'
import { mezzanineFixture } from '../../../../../core/src/lib/__fixtures__/mezzanine'
import { runSharedAgentTool } from '../ai-shared-agent-executor'
import { SHARED_OPENAI_TOOLS, SUPPORTED_REMOTE_MCP_TOOL_NAMES } from '../contracts'
import { OPENAI_TOOLS } from '../prompt/openai-tools'
import { executeRemoteMcpToolCall } from '../mcp-tool-router'
import { getSceneOperations, resetSceneOperationsForTesting } from '../scene-operations-adapter'

const compiler = vi.hoisted(() => vi.fn())
vi.mock('../../../lib/geometry-script/author', () => ({
  compileAndStoreGeometryScript: compiler,
  storedScript: vi.fn(async () => 'export default function build() {}'),
}))

let restoreRegistry = () => {}
let levelId = ''

function compiled(mount: 'floor' | 'wall' = 'floor', params: Record<string, number> = {}) {
  return {
    sha256: 'a'.repeat(64), script: 'b'.repeat(64), mount, params,
    manifest: GeometryArtifactManifest.parse({
      bounds: { min: [-0.45, 0, -0.1], max: [0.45, params.height ?? 2.1, 0.1] },
      triangles: 12,
      params: [{ id: 'height', kind: 'number', default: 2.1, min: 0.5, max: 5 }],
      slots: [{ id: 'trim' }], parts: [{ id: 'post', type: 'column' }],
    }),
  }
}

beforeEach(() => {
  restoreRegistry = nodeRegistry._snapshot()
  resetSceneOperationsForTesting()
  useScene.setState({ readOnly: false })
  const ops = getSceneOperations()
  ops.setScene({}, [])
  ops.loadDefault()
  ops.clearHistory()
  levelId = Object.values(ops.getNodes()).find((node) => node.type === 'level')!.id
  useViewer.getState().setSelection({ levelId: levelId as `level_${string}` })
  compiler.mockReset()
  compiler.mockImplementation(async (input) => {
    input.assertCurrent?.()
    const previous = input.nodeId ? useScene.getState().nodes[input.nodeId as `door_${string}`] : undefined
    return compiled(input.code?.includes('wall') || previous?.type === 'door' || previous?.type === 'window' ? 'wall' : 'floor', input.params)
  })
})

afterEach(() => {
  restoreRegistry()
  configureArtifactStore(null)
  useScene.setState({ readOnly: false })
})

describe('shared agent tool contracts', () => {
  it('publishes every shared contract exactly once, with its input schema and description', () => {
    for (const contract of AGENT_TOOL_CONTRACTS) {
      const tools = OPENAI_TOOLS.filter((tool) => tool.type === 'function' && tool.function.name === contract.name)
      expect(tools).toHaveLength(1)
      const tool = tools[0]!
      if (tool.type !== 'function') throw Error('Expected function')
      expect(tool.function.description).toBe(contract.description)
      expect(tool.function.parameters).toEqual(z.toJSONSchema(z.object(contract.input), { io: 'input' }))
      expect(SUPPORTED_REMOTE_MCP_TOOL_NAMES).toContain(contract.name)
    }
    expect(SHARED_OPENAI_TOOLS).toHaveLength(AGENT_TOOL_CONTRACTS.length)
  })
})

describe('shared agent browser executor', () => {
  it('adds a native column using the shared measurement parser and undoes in one step', async () => {
    const { result } = await runSharedAgentTool({ name: 'add_column', input: { x: 1, z: 2, height: '180cm' } })
    const id = result.nodeId as `column_${string}`
    expect(useScene.getState().nodes[id]).toMatchObject({ type: 'column', height: 1.8, position: [1, 0, 2] })
    expect(compiler).not.toHaveBeenCalled()
    expect(getSceneOperations().getHistory().pastCount).toBe(1)
    getSceneOperations().undo()
    expect(useScene.getState().nodes[id]).toBeUndefined()
  })

  it('builds an object, then reads its source and rebuilds it while keeping identity and paint', async () => {
    const created = await runSharedAgentTool({ name: 'add_object', input: { code: 'floor module', position: [2, 0, 3] } })
    const id = created.result.nodeId as `item_${string}`
    useScene.getState().updateNode(id, { slots: { trim: 'library:preset-white' } })
    const source = await runSharedAgentTool({ name: 'get_source', input: { nodeId: id } })
    expect(source.result).toMatchObject({ nodeId: id, type: 'item', code: expect.any(String) })
    await runSharedAgentTool({ name: 'add_object', input: { nodeId: id, params: { height: 3 } } })
    expect(useScene.getState().nodes[id]).toMatchObject({
      id, position: [2, 0, 3], slots: { trim: 'library:preset-white' },
      source: { params: { height: 3 } },
    })
  })

  it('queries typed parts without changing the scene', async () => {
    await runSharedAgentTool({ name: 'add_object', input: { code: 'floor module' } })
    const before = useScene.getState().nodes
    const found = await runSharedAgentTool({ name: 'find_by_type', input: { type: 'column' } })
    expect(found.result.count).toBe(1)
    expect(useScene.getState().nodes).toBe(before)
  })

  it('runs the shared level and scene queries without mutating nodes', async () => {
    const before = useScene.getState().nodes
    for (const name of ['list_levels', 'get_level_summary', 'get_walls', 'get_zones', 'verify_scene'] as const) {
      await expect(runSharedAgentTool({ name, input: { levelId } })).resolves.toHaveProperty('result')
      expect(useScene.getState().nodes).toBe(before)
    }
    await expect(runSharedAgentTool({ name: 'get_node', input: { id: levelId } })).resolves.toMatchObject({ result: { node: { id: levelId } } })
  })

  it('duplicates a level through the shared operation in one history step', async () => {
    const { result } = await runSharedAgentTool({ name: 'duplicate_level', input: { levelId } })
    expect(Object.values(useScene.getState().nodes).filter((node) => node.type === 'level')).toHaveLength(2)
    expect(result).toBeDefined()
    expect(getSceneOperations().getHistory().pastCount).toBe(1)
    getSceneOperations().undo()
    expect(Object.values(useScene.getState().nodes).filter((node) => node.type === 'level')).toHaveLength(1)
  })

  it('writes room intent using the shared structure runtime and undoes it', async () => {
    const fixture = mezzanineFixture()
    const ops = getSceneOperations()
    ops.setScene(fixture.before, [fixture.level.id])
    ops.clearHistory()
    const room = Object.values(ops.getNodes()).find((node) => node.type === 'zone')!
    const before = useScene.getState().nodes[room.id]!.name
    await runSharedAgentTool({ name: 'set_zone_intent', input: { zoneId: room.id, patch: { name: 'Shared room' } } })
    expect(useScene.getState().nodes[room.id]?.name).toBe('Shared room')
    expect(ops.getHistory().pastCount).toBe(1)
    ops.undo()
    expect(useScene.getState().nodes[room.id]?.name).toBe(before)
  })

  it('refuses a structure conflict before changing the scene', async () => {
    const fixture = mezzanineFixture()
    const ops = getSceneOperations()
    ops.setScene(fixture.before, [fixture.level.id])
    const room = Object.values(ops.getNodes()).find((node) => node.type === 'zone')!
    const before = useScene.getState().nodes
    await expect(runSharedAgentTool({ name: 'create_mezzanine', input: {
      hostZoneId: room.id, polygon: [[-1, 1], [3, 1], [3, 3], [-1, 3]],
    } })).rejects.toMatchObject({ code: 'structure_conflict' })
    expect(useScene.getState().nodes).toBe(before)
  })

  it('builds and rescripts a door through the shared opening planner', async () => {
    const wall = WallNode.parse({ start: [0, 0], end: [5, 0], height: 3 })
    useScene.getState().createNode(wall, levelId as `level_${string}`)
    const { result } = await runSharedAgentTool({ name: 'add_door', input: { wallId: wall.id, t: 0.5, code: 'wall module' } })
    const id = result.nodeId as `door_${string}`
    const before = useScene.getState().nodes[id]!
    await runSharedAgentTool({ name: 'add_door', input: { nodeId: id, params: { height: 2.5 } } })
    expect(useScene.getState().nodes[id]).toMatchObject({ id, wallId: wall.id, height: 2.5 })
    expect(useScene.getState().nodes[id]?.parentId).toBe(before.parentId)
  })

  it('refuses the wrong opening kind before compiling or editing', async () => {
    const { result } = await runSharedAgentTool({ name: 'add_column', input: { x: 1, z: 2 } })
    const before = useScene.getState().nodes
    await expect(runSharedAgentTool({ name: 'add_door', input: { nodeId: result.nodeId, code: 'wall module' } })).rejects.toMatchObject({ code: 'wrong_node_kind' })
    expect(compiler).not.toHaveBeenCalled()
    expect(useScene.getState().nodes).toBe(before)
  })

  it('rejects mutations in a read-only scene while allowing reads', async () => {
    useScene.setState({ readOnly: true })
    await expect(runSharedAgentTool({ name: 'add_object', input: { code: 'floor module' } })).rejects.toMatchObject({ code: 'read_only' })
    expect(compiler).not.toHaveBeenCalled()
    await expect(runSharedAgentTool({ name: 'list_levels', input: {} })).resolves.toHaveProperty('result')
  })

  it('refuses a compiled result after the project changes', async () => {
    compiler.mockImplementation(async () => {
      useScene.setState({ nodes: {} })
      return compiled()
    })
    await expect(runSharedAgentTool({ name: 'add_object', input: { code: 'floor module' } })).rejects.toMatchObject({ code: 'scene_changed' })
    expect(useScene.getState().nodes).toEqual({})
  })

  it('refuses a compiled result after the project artifact store changes', async () => {
    const before = useScene.getState().nodes
    compiler.mockImplementation(async () => {
      configureArtifactStore({ url: () => null, put: async () => {}, text: async () => null })
      return compiled()
    })
    await expect(runSharedAgentTool({ name: 'add_object', input: { code: 'floor module' } })).rejects.toMatchObject({ code: 'scene_changed' })
    expect(useScene.getState().nodes).toBe(before)
  })

  it('allows the compiled rebuild entry while raw patches cannot replace script-owned fields', async () => {
    const created = await runSharedAgentTool({ name: 'add_object', input: { code: 'floor module' } })
    const id = created.result.nodeId as `item_${string}`
    const before = useScene.getState().nodes
    const previous = before[id] as { source?: unknown }
    const raw = await executeRemoteMcpToolCall({ toolName: 'apply_patch', args: {
      patches: [{ op: 'update', id, data: { source: { ...(previous.source as object), script: 'c'.repeat(64) } } }],
    } })
    expect(raw.ok).toBe(false)
    expect(raw.error).toContain('scripted_field')
    expect(useScene.getState().nodes).toBe(before)
  })

  it('keeps the registered deletion restriction on the shared delete tool', async () => {
    nodeRegistry._register({ kind: 'level', schemaVersion: 1, capabilities: { deletable: false } } as never)
    await expect(runSharedAgentTool({ name: 'delete_node', input: { id: levelId } })).rejects.toMatchObject({ code: 'not_deletable' })
    expect(useScene.getState().nodes[levelId as `level_${string}`]).toBeDefined()
  })

  it('edits and lists a collection through the shared operation and undoes it', async () => {
    const { result } = await runSharedAgentTool({ name: 'edit_collection', input: { name: 'Selected level', add: [levelId] } })
    expect(result.created).toBe(true)
    const listed = await runSharedAgentTool({ name: 'list_collections', input: {} })
    expect(listed.result.count).toBe(1)
    getSceneOperations().undo()
    expect(useScene.getState().collections).toEqual({})
  })
})
