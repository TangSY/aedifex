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
import {
  getSharedOpenAITools,
  SHARED_OPENAI_TOOLS,
  SUPPORTED_REMOTE_MCP_TOOL_NAMES,
} from '../contracts'
import { OPENAI_TOOLS } from '../prompt/openai-tools'
import { executeRemoteMcpToolCall } from '../mcp-tool-router'
import { getSceneOperations, resetSceneOperationsForTesting } from '../scene-operations-adapter'

const compiler = vi.hoisted(() => vi.fn())
vi.mock('../../../lib/geometry-script/author', () => ({
  compileAndStoreGeometryScript: compiler,
  getGeometryScriptCapabilities: () => ({ languages: ['three'] }),
  storedScript: vi.fn(async () => 'export default function build() {}'),
}))

let restoreRegistry = () => {}
let levelId = ''

function compiled(mount: 'floor' | 'wall' = 'floor', params: Record<string, number> = {}) {
  return {
    sha256: 'a'.repeat(64),
    script: 'b'.repeat(64),
    mount,
    params,
    manifest: GeometryArtifactManifest.parse({
      bounds: { min: [-0.45, 0, -0.1], max: [0.45, params.height ?? 2.1, 0.1] },
      triangles: 12,
      params: [{ id: 'height', kind: 'number', default: 2.1, min: 0.5, max: 5 }],
      slots: [{ id: 'trim' }],
      parts: [{ id: 'post', type: 'column' }],
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
  configureArtifactStore({
    put: async (hash) => hash,
    text: async () => 'export default function build() {}',
    url: () => null,
  })
  compiler.mockReset()
  compiler.mockImplementation(async (input) => {
    input.assertCurrent?.()
    const previous = input.nodeId
      ? useScene.getState().nodes[input.nodeId as `door_${string}`]
      : undefined
    return compiled(
      input.code?.includes('wall') || previous?.type === 'door' || previous?.type === 'window'
        ? 'wall'
        : 'floor',
      input.params,
    )
  })
})

afterEach(() => {
  restoreRegistry()
  configureArtifactStore(null)
  useScene.setState({ readOnly: false })
})

describe('shared agent tool contracts', () => {
  it('publishes every shared contract exactly once, with its input schema and description', () => {
    const allTools = getSharedOpenAITools({ languages: ['three', 'bpy'], clearScene: true })
    for (const contract of AGENT_TOOL_CONTRACTS) {
      const tools = allTools.filter(
        (tool) => tool.type === 'function' && tool.function.name === contract.name,
      )
      expect(tools).toHaveLength(1)
      const tool = tools[0]!
      if (tool.type !== 'function') throw Error('Expected function')
      expect(tool.function.description).toBe(contract.description)
      expect(tool.function.parameters).toEqual(
        z.toJSONSchema(z.object(contract.input), { io: 'input' }),
      )
      expect(SUPPORTED_REMOTE_MCP_TOOL_NAMES).toContain(contract.name)
    }
    expect(SHARED_OPENAI_TOOLS).toHaveLength(AGENT_TOOL_CONTRACTS.length - 1)
    expect(
      SHARED_OPENAI_TOOLS.some(
        (tool) => tool.type === 'function' && tool.function.name === 'clear_scene',
      ),
    ).toBe(false)
  })

  it('offers only three execution by default and omits the Blender build instructions', () => {
    for (const tool of SHARED_OPENAI_TOOLS) {
      if (tool.type !== 'function') continue
      expect(tool.function.description).not.toContain('Blender instead')
      const properties = tool.function.parameters?.properties as Record<string, unknown> | undefined
      if (properties?.language) expect(properties.language).toMatchObject({ const: 'three' })
    }
  })
})

describe('shared agent browser executor', () => {
  it('refuses explicit Python execution before compiling or changing the scene', async () => {
    const before = useScene.getState().nodes
    await expect(
      runSharedAgentTool({
        name: 'add_object',
        input: {
          name: 'Carved trim',
          category: 'trim',
          reason: 'No matching trim type',
          code: 'import bpy',
          language: 'bpy',
        },
      }),
    ).rejects.toMatchObject({ code: 'scripts_unavailable' })
    expect(compiler).not.toHaveBeenCalled()
    expect(useScene.getState().nodes).toBe(before)
  })

  it('reads saved Python source with its language while refusing params-only execution', async () => {
    const created = await runSharedAgentTool({
      name: 'add_object',
      input: {
        name: 'Trim object',
        category: 'trim',
        reason: 'No matching trim type',
        code: 'floor module',
      },
    })
    const id = created.result.nodeId as `item_${string}`
    const node = useScene.getState().nodes[id]!
    if (node.type !== 'item' || !node.source) throw new Error('Expected an authored item')
    useScene.setState({
      nodes: {
        ...useScene.getState().nodes,
        [id]: { ...node, source: { ...node.source, language: 'bpy' } },
      },
    })
    expect(
      (await runSharedAgentTool({ name: 'get_source', input: { nodeId: id } })).result,
    ).toMatchObject({ nodeId: id, language: 'bpy', code: expect.any(String) })
    compiler.mockClear()
    const before = useScene.getState().nodes
    await expect(
      runSharedAgentTool({
        name: 'add_object',
        input: { name: 'Trim object', category: 'trim', nodeId: id, params: { height: 3 } },
      }),
    ).rejects.toMatchObject({ code: 'scripts_unavailable' })
    expect(compiler).not.toHaveBeenCalled()
    expect(useScene.getState().nodes).toBe(before)
  })

  it('keeps clear_scene unavailable without a host reset-and-save path', async () => {
    const before = useScene.getState().nodes
    await expect(
      runSharedAgentTool({ name: 'clear_scene', input: { reason: 'Start over' } }),
    ).rejects.toMatchObject({ code: 'clear_scene_unavailable' })
    expect(useScene.getState().nodes).toBe(before)
  })

  it('writes a native paint material with its nodes in one step and restores it on undo', async () => {
    const created = await runSharedAgentTool({ name: 'add_column', input: { x: 1, z: 2 } })
    const id = created.result.nodeId as `column_${string}`
    const before = useScene.getState().nodes[id]
    getSceneOperations().clearHistory()
    const painted = await runSharedAgentTool({
      name: 'paint',
      input: {
        targets: [id],
        material: { properties: { color: '#aabbcc', roughness: 0.4, metalness: 0.2 } },
      },
    })
    expect(painted.result).toMatchObject({ ok: true, materialId: expect.any(String) })
    expect(useScene.getState().materials[painted.result.materialId as `sm_${string}`]).toBeDefined()
    expect(getSceneOperations().getHistory().pastCount).toBe(1)
    getSceneOperations().undo()
    expect(useScene.getState().nodes[id]).toEqual(before)
    expect(
      useScene.getState().materials[painted.result.materialId as `sm_${string}`],
    ).toBeUndefined()
  })

  it('returns the reconciled room construction and removes it in one undo', async () => {
    const before = useScene.getState().nodes
    const created = await runSharedAgentTool({
      name: 'create_room',
      input: {
        level: levelId,
        name: 'Study',
        polygon: [
          [0, 0],
          [4, 0],
          [4, 3],
          [0, 3],
        ],
      },
    })
    expect(created.result).toMatchObject({
      zoneId: expect.any(String),
      slabId: expect.any(String),
      ceilingId: expect.any(String),
    })
    expect(getSceneOperations().getHistory().pastCount).toBe(1)
    getSceneOperations().undo()
    expect(useScene.getState().nodes).toEqual(before)
  })
  it('adds a native column using the shared measurement parser and undoes in one step', async () => {
    const { result } = await runSharedAgentTool({
      name: 'add_column',
      input: { x: 1, z: 2, height: '180cm' },
    })
    const id = result.nodeId as `column_${string}`
    expect(useScene.getState().nodes[id]).toMatchObject({
      type: 'column',
      height: 1.8,
      position: [1, 0, 2],
    })
    expect(compiler).not.toHaveBeenCalled()
    expect(getSceneOperations().getHistory().pastCount).toBe(1)
    getSceneOperations().undo()
    expect(useScene.getState().nodes[id]).toBeUndefined()
  })

  it('builds an object, then reads its source and rebuilds it while keeping identity and paint', async () => {
    const created = await runSharedAgentTool({
      name: 'add_object',
      input: {
        name: 'Trim object',
        category: 'trim',
        reason: 'No matching trim type',
        code: 'floor module',
        position: [2, 0, 3],
      },
    })
    const id = created.result.nodeId as `item_${string}`
    useScene.getState().updateNode(id, { slots: { trim: 'library:preset-white' } })
    const source = await runSharedAgentTool({ name: 'get_source', input: { nodeId: id } })
    expect(source.result).toMatchObject({ nodeId: id, type: 'item', code: expect.any(String) })
    await runSharedAgentTool({
      name: 'add_object',
      input: { name: 'Trim object', category: 'trim', nodeId: id, params: { height: 3 } },
    })
    expect(useScene.getState().nodes[id]).toMatchObject({
      id,
      position: [2, 0, 3],
      slots: { trim: 'library:preset-white' },
      source: { params: { height: 3 } },
    })
  })

  it('queries typed parts without changing the scene', async () => {
    await runSharedAgentTool({
      name: 'add_object',
      input: {
        name: 'Trim object',
        category: 'trim',
        reason: 'No matching trim type',
        code: 'floor module',
      },
    })
    const before = useScene.getState().nodes
    const found = await runSharedAgentTool({ name: 'find_by_type', input: { type: 'column' } })
    expect(found.result.count).toBe(1)
    expect(useScene.getState().nodes).toBe(before)
  })

  it('runs the shared level and scene queries without mutating nodes', async () => {
    const before = useScene.getState().nodes
    for (const name of [
      'list_levels',
      'get_level_summary',
      'get_walls',
      'get_zones',
      'verify_scene',
    ] as const) {
      await expect(runSharedAgentTool({ name, input: { levelId } })).resolves.toHaveProperty(
        'result',
      )
      expect(useScene.getState().nodes).toBe(before)
    }
    await expect(
      runSharedAgentTool({ name: 'get_node', input: { id: levelId } }),
    ).resolves.toMatchObject({ result: { node: { id: levelId } } })
  })

  it('duplicates a level through the shared operation in one history step', async () => {
    const { result } = await runSharedAgentTool({ name: 'duplicate_level', input: { levelId } })
    expect(
      Object.values(useScene.getState().nodes).filter((node) => node.type === 'level'),
    ).toHaveLength(2)
    expect(result).toBeDefined()
    expect(getSceneOperations().getHistory().pastCount).toBe(1)
    getSceneOperations().undo()
    expect(
      Object.values(useScene.getState().nodes).filter((node) => node.type === 'level'),
    ).toHaveLength(1)
  })

  it('writes room intent using the shared structure runtime and undoes it', async () => {
    const fixture = mezzanineFixture()
    const ops = getSceneOperations()
    ops.setScene(fixture.before, [fixture.level.id])
    ops.clearHistory()
    const room = Object.values(ops.getNodes()).find((node) => node.type === 'zone')!
    const before = useScene.getState().nodes[room.id]!.name
    await runSharedAgentTool({
      name: 'set_zone_intent',
      input: { zoneId: room.id, patch: { name: 'Shared room' } },
    })
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
    await expect(
      runSharedAgentTool({
        name: 'create_mezzanine',
        input: {
          hostZoneId: room.id,
          polygon: [
            [-1, 1],
            [3, 1],
            [3, 3],
            [-1, 3],
          ],
        },
      }),
    ).resolves.toMatchObject({ result: { conflicts: expect.any(Array) } })
    expect(useScene.getState().nodes).toBe(before)
  })

  it('builds and rescripts a door through the shared opening planner', async () => {
    const wall = WallNode.parse({ start: [0, 0], end: [5, 0], height: 3 })
    useScene.getState().createNode(wall, levelId as `level_${string}`)
    const { result } = await runSharedAgentTool({
      name: 'add_door',
      input: { wallId: wall.id, t: 0.5, code: 'wall module' },
    })
    const id = result.nodeId as `door_${string}`
    const before = useScene.getState().nodes[id]!
    await runSharedAgentTool({ name: 'add_door', input: { nodeId: id, params: { height: 2.5 } } })
    expect(useScene.getState().nodes[id]).toMatchObject({ id, wallId: wall.id, height: 2.5 })
    expect(useScene.getState().nodes[id]?.parentId).toBe(before.parentId)
  })

  it('refuses the wrong opening kind before compiling or editing', async () => {
    const { result } = await runSharedAgentTool({ name: 'add_column', input: { x: 1, z: 2 } })
    const before = useScene.getState().nodes
    await expect(
      runSharedAgentTool({
        name: 'add_door',
        input: { nodeId: result.nodeId, code: 'wall module' },
      }),
    ).rejects.toMatchObject({ code: 'wrong_node_kind' })
    expect(compiler).not.toHaveBeenCalled()
    expect(useScene.getState().nodes).toBe(before)
  })

  it('rejects mutations in a read-only scene while allowing reads', async () => {
    useScene.setState({ readOnly: true })
    await expect(
      runSharedAgentTool({
        name: 'add_object',
        input: {
          name: 'Trim object',
          category: 'trim',
          reason: 'No matching trim type',
          code: 'floor module',
        },
      }),
    ).rejects.toMatchObject({ code: 'read_only' })
    expect(compiler).not.toHaveBeenCalled()
    await expect(runSharedAgentTool({ name: 'list_levels', input: {} })).resolves.toHaveProperty(
      'result',
    )
  })

  it('refuses a compiled result after the project changes', async () => {
    compiler.mockImplementation(async () => {
      useScene.setState({ nodes: {} })
      return compiled()
    })
    await expect(
      runSharedAgentTool({
        name: 'add_object',
        input: {
          name: 'Trim object',
          category: 'trim',
          reason: 'No matching trim type',
          code: 'floor module',
        },
      }),
    ).rejects.toMatchObject({ code: 'scene_changed' })
    expect(useScene.getState().nodes).toEqual({})
  })

  it('refuses a compiled result after the project artifact store changes', async () => {
    const before = useScene.getState().nodes
    compiler.mockImplementation(async () => {
      configureArtifactStore({ url: () => null, put: async () => {}, text: async () => null })
      return compiled()
    })
    await expect(
      runSharedAgentTool({
        name: 'add_object',
        input: {
          name: 'Trim object',
          category: 'trim',
          reason: 'No matching trim type',
          code: 'floor module',
        },
      }),
    ).rejects.toMatchObject({ code: 'scene_changed' })
    expect(useScene.getState().nodes).toBe(before)
  })

  it.each(['abort', 'scope'] as const)(
    'refuses a remote compiled result when its MCP session ends by %s',
    async (end) => {
      const before = useScene.getState().nodes
      const controller = new AbortController()
      let current = true
      compiler.mockImplementation(async () => {
        if (end === 'abort') controller.abort()
        else current = false
        return compiled()
      })
      const result = await executeRemoteMcpToolCall({
        toolName: 'add_object',
        args: {
          name: 'Trim object',
          category: 'trim',
          reason: 'No matching trim type',
          code: 'floor module',
        },
        signal: controller.signal,
        assertCurrent: () => {
          if (!current) throw new DOMException('MCP session changed', 'AbortError')
        },
      })
      expect(result.ok).toBe(false)
      expect(result.error).toMatch(/aborted|changed/)
      expect(compiler).toHaveBeenCalledOnce()
      expect(useScene.getState().nodes).toBe(before)
      expect(getSceneOperations().getHistory().pastCount).toBe(0)
    },
  )

  it('allows the compiled rebuild entry while raw patches cannot replace script-owned fields', async () => {
    const created = await runSharedAgentTool({
      name: 'add_object',
      input: {
        name: 'Trim object',
        category: 'trim',
        reason: 'No matching trim type',
        code: 'floor module',
      },
    })
    const id = created.result.nodeId as `item_${string}`
    const before = useScene.getState().nodes
    const previous = before[id] as { source?: unknown }
    const raw = await executeRemoteMcpToolCall({
      toolName: 'apply_patch',
      args: {
        patches: [
          {
            op: 'update',
            id,
            data: { source: { ...(previous.source as object), script: 'c'.repeat(64) } },
          },
        ],
      },
    })
    expect(raw.ok).toBe(false)
    expect(raw.error).toContain('scripted_field')
    expect(useScene.getState().nodes).toBe(before)
  })

  it('keeps the registered deletion restriction on the shared delete tool', async () => {
    nodeRegistry._register({
      kind: 'level',
      schemaVersion: 1,
      capabilities: { deletable: false },
    } as never)
    await expect(
      runSharedAgentTool({ name: 'delete_node', input: { id: levelId } }),
    ).rejects.toMatchObject({ code: 'not_deletable' })
    expect(useScene.getState().nodes[levelId as `level_${string}`]).toBeDefined()
  })

  it('edits and lists a collection through the shared operation and undoes it', async () => {
    const { result } = await runSharedAgentTool({
      name: 'edit_collection',
      input: { name: 'Selected level', add: [levelId] },
    })
    expect(result.created).toBe(true)
    const listed = await runSharedAgentTool({ name: 'list_collections', input: {} })
    expect(listed.result.count).toBe(1)
    getSceneOperations().undo()
    expect(useScene.getState().collections).toEqual({})
  })
})

describe('upstream shared host integration', () => {
  it('builds a batch and applies it as one undo step', async () => {
    const before = useScene.getState().nodes
    const result = await runSharedAgentTool({
      name: 'run_batch',
      input: {
        calls: [
          {
            tool: 'add_object',
            input: {
              name: 'Trim A',
              category: 'trim',
              reason: 'Custom profile',
              code: 'floor module',
              position: [1, 0, 1],
            },
          },
          {
            tool: 'add_object',
            input: {
              name: 'Trim B',
              category: 'trim',
              reason: 'Custom profile',
              code: 'floor module',
              position: [3, 0, 1],
            },
          },
        ],
      },
    })
    expect(result.result).toMatchObject({ applied: 2, refused: 0 })
    expect(compiler).toHaveBeenCalledTimes(2)
    expect(getSceneOperations().getHistory().pastCount).toBe(1)
    getSceneOperations().undo()
    expect(useScene.getState().nodes).toEqual(before)
  })

  it('keeps failed Python batch entries out without enabling Python', async () => {
    const before = useScene.getState().nodes
    const result = await runSharedAgentTool({
      name: 'run_batch',
      input: {
        calls: [
          {
            tool: 'add_object',
            input: {
              name: 'Python',
              category: 'trim',
              reason: 'Custom profile',
              code: 'import bpy',
              language: 'bpy',
            },
          },
        ],
      },
    })
    expect(result.result).toMatchObject({
      applied: 0,
      refused: 1,
      calls: [{ code: 'scripts_unavailable' }],
    })
    expect(compiler).not.toHaveBeenCalled()
    expect(useScene.getState().nodes).toBe(before)
  })

  it('aborts the entire batch when its project changes during compilation', async () => {
    const before = useScene.getState().nodes
    const previousProject = useViewer.getState().projectId
    compiler.mockImplementation(async () => {
      useViewer.setState({ projectId: 'other-project' })
      return compiled()
    })
    try {
      await expect(
        runSharedAgentTool({
          name: 'run_batch',
          input: {
            calls: [
              {
                tool: 'add_object',
                input: {
                  name: 'Trim',
                  category: 'trim',
                  reason: 'Custom profile',
                  code: 'floor module',
                },
              },
            ],
          },
        }),
      ).rejects.toMatchObject({ code: 'scene_changed' })
      expect(useScene.getState().nodes).toBe(before)
      expect(getSceneOperations().getHistory().pastCount).toBe(0)
    } finally {
      useViewer.setState({ projectId: previousProject })
    }
  })

  it('compiles a whole design before committing native nodes in one undo step', async () => {
    const before = useScene.getState().nodes
    const result = await runSharedAgentTool({
      name: 'author_scene',
      input: {
        payload: {
          levels: [
            {
              name: 'Ground',
              elevation: 0,
              rooms: [],
              columns: [{ position: [0, 0], width: 0.3, depth: 0.3, height: 3 }],
              items: [
                {
                  id: 'trim',
                  name: 'Trim',
                  category: 'trim',
                  code: 'floor module',
                  position: [2, 0, 2],
                },
              ],
            },
          ],
        },
      },
    })
    expect(result.result).toMatchObject({ itemsCompiled: 1, verify: expect.any(Object) })
    expect(Object.values(useScene.getState().nodes).some((node) => node.type === 'column')).toBe(
      true,
    )
    expect(getSceneOperations().getHistory().pastCount).toBe(1)
    getSceneOperations().undo()
    expect(useScene.getState().nodes).toEqual(before)
  })

  it('never commits a cancelled author_scene candidate', async () => {
    const before = useScene.getState().nodes
    const controller = new AbortController()
    compiler.mockImplementation(async () => {
      controller.abort()
      return compiled()
    })
    await expect(
      runSharedAgentTool({
        name: 'author_scene',
        signal: controller.signal,
        input: {
          payload: {
            levels: [
              {
                name: 'Ground',
                rooms: [],
                items: [
                  {
                    id: 'trim',
                    name: 'Trim',
                    category: 'trim',
                    code: 'floor module',
                    position: [2, 0, 2],
                  },
                ],
              },
            ],
          },
        },
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(useScene.getState().nodes).toBe(before)
    expect(getSceneOperations().getHistory().pastCount).toBe(0)
  })

  it.each(['validate_scene', 'find_nodes', 'describe_node'])(
    'answers retired %s with a replacement without listing it',
    async (toolName) => {
      expect(SUPPORTED_REMOTE_MCP_TOOL_NAMES).not.toContain(toolName)
      expect(await executeRemoteMcpToolCall({ toolName, args: {} })).toMatchObject({
        ok: false,
        code: 'tool_retired',
      })
    },
  )

  it('remembers checkpoints in the browser session', async () => {
    await runSharedAgentTool({ name: 'set_checkpoint', input: { name: 'before' } })
    const result = await runSharedAgentTool({ name: 'verify_scene', input: { since: 'before' } })
    expect(result.result).toMatchObject({
      checkpoints: ['before'],
      since: { checkpoint: 'before' },
    })
  })
})
