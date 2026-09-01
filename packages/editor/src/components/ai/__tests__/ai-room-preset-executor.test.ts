/**
 * executeRoomPresetToolCalls — host-async dispatch coverage.
 *
 * Pins the contract between the agent loop and the RoomPresetProvider:
 *  - save: provider.save(zoneId, zoneName) receives the VALIDATOR-resolved
 *    values, success/failure wording (host messages verbatim) lands in the
 *    ToolResult fed back to the LLM
 *  - insert: provider.insert(presetId, { levelId, position }), rootIds are
 *    recorded as AIOperationLog.createdNodeIds, the inserted nodes get
 *    selected, and undoConfirmedOperation deletes the rootIds (cascade)
 *  - invalid validation short-circuits: the provider is never called and
 *    the errorReason flows into the ToolResult errors
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RoomPresetSummaryEntry } from '../contracts/runtime'

// ============================================================================
// Mocks
// ============================================================================

const mockNodes: Record<string, any> = {}
const mockDeletedNodeIds: string[] = []
const mockSetSelection = vi.fn()
const mockSelectionLevelId = { value: 'level_1' as string | null }

const mockSetOperations = vi.fn()
const mockConfirmOperations = vi.fn()
const mockRejectOperations = vi.fn()
const mockAddOperationLog = vi.fn()
const mockInvalidateSceneCache = vi.fn()

const mockPresetList = { value: [] as RoomPresetSummaryEntry[] }
const mockSave = vi.fn()
const mockInsert = vi.fn()
const mockToolValidated = vi.fn()

let _idCounter = 0
const nextId = (prefix: string) => `${prefix}_mock_${++_idCounter}`

vi.mock('@aedifex/core', () => {
  const makeParser = (typeName: string) => ({
    parse: (data: any) => ({
      ...data,
      id: data.id ?? nextId(typeName),
      type: typeName,
      parentId: data.parentId ?? null,
      visible: data.visible ?? true,
      metadata: data.metadata ?? {},
      children: data.children ?? [],
    }),
  })
  return {
    useScene: {
      getState: () => ({
        nodes: mockNodes,
        updateNode: vi.fn(),
        setNode: vi.fn(),
        createNodes: vi.fn(),
        dirtyNodes: new Set<string>(),
      }),
      temporal: { getState: () => ({ pause: vi.fn(), resume: vi.fn() }) },
    },
    spatialGridManager: {
      canPlaceOnFloor: vi.fn(() => ({ valid: true, conflictIds: [] })),
      getSlabElevationForItem: vi.fn(() => 0),
      getSlabElevationAt: vi.fn(() => 0),
    },
    getCatalogMaterialById: vi.fn(() => undefined),
    nodeRegistry: { get: () => ({ deletable: true, capabilities: { deletable: true } }) },
    cloneLevelSubtree: vi.fn(() => ({ clonedNodes: [], newLevelId: 'level_clone_1' })),
    generateId: (prefix: string) => nextId(prefix),
    ItemNode: makeParser('item'),
    WallNode: makeParser('wall'),
    DoorNode: makeParser('door'),
    WindowNode: makeParser('window'),
    LevelNode: makeParser('level'),
    SlabNode: makeParser('slab'),
    CeilingNode: makeParser('ceiling'),
    RoofNode: makeParser('roof'),
    RoofSegmentNode: makeParser('roof-segment'),
    StairNode: makeParser('stair'),
    StairSegmentNode: makeParser('stair-segment'),
    ZoneNode: makeParser('zone'),
    BuildingNode: makeParser('building'),
    ScanNode: makeParser('scan'),
    GuideNode: makeParser('guide'),
    FenceNode: makeParser('fence'),
    ChimneyNode: makeParser('chimney'),
    DormerNode: makeParser('dormer'),
    SkylightNode: makeParser('skylight'),
    SolarPanelNode: makeParser('solar-panel'),
    RidgeVentNode: makeParser('ridge-vent'),
    BoxVentNode: makeParser('box-vent'),
    TurbineVentNode: makeParser('turbine-vent'),
    EyebrowVentNode: makeParser('eyebrow-vent'),
    CupolaNode: makeParser('cupola'),
    GutterNode: makeParser('gutter'),
    DownspoutNode: makeParser('downspout'),
    ElevatorNode: makeParser('elevator'),
  }
})

vi.mock('@aedifex/viewer', () => ({
  useViewer: {
    getState: () => ({
      selection: { levelId: mockSelectionLevelId.value },
      setSelection: mockSetSelection,
    }),
  },
}))

vi.mock('../ai-chat-store', () => ({
  useAIChat: {
    getState: () => ({
      setOperations: mockSetOperations,
      confirmOperations: mockConfirmOperations,
      rejectOperations: mockRejectOperations,
      addOperationLog: mockAddOperationLog,
    }),
  },
}))

vi.mock('../ai-scene-serializer', () => ({
  // Lazy wrapper: vi.mock factories are hoisted above the const declarations,
  // so referencing the spy directly would hit the TDZ at module-mock time.
  invalidateSceneCache: (...args: unknown[]) => mockInvalidateSceneCache(...args),
}))

vi.mock('../ai-catalog-resolver', () => ({
  resolveCatalogSlug: vi.fn(() => ({ asset: null, matchType: 'none', suggestions: [] })),
  generateCatalogSummary: vi.fn(() => ''),
}))

vi.mock('../runtime', () => ({
  getAIRuntime: () => ({ telemetry: { toolValidated: mockToolValidated } }),
  getRoomPresetProvider: () => ({
    list: () => mockPresetList.value,
    save: mockSave,
    insert: mockInsert,
  }),
}))

vi.mock('../scene-operations-adapter', () => ({
  getSceneOperations: () => ({
    createNode: vi.fn(),
    createNodes: vi.fn(),
    deleteNode: vi.fn((id: string, _cascade?: boolean) => {
      delete mockNodes[id]
      mockDeletedNodeIds.push(id)
    }),
    updateNode: vi.fn(),
    applyPatch: vi.fn(),
  }),
  resetSceneOperationsForTesting: vi.fn(),
}))

vi.mock('../../../lib/elevator-support', () => ({
  resolveCurrentBuildingId: vi.fn(() => null),
  resolveElevatorSupportY: vi.fn(() => 0),
}))

// ============================================================================
// Imports under test
// ============================================================================

import { executeRoomPresetToolCalls, isRoomPresetToolCall } from '../ai-room-preset-executor'
import { undoConfirmedOperation } from '../preview/confirm-operations'
import type { AIOperationLog } from '../types'

const PRESETS: RoomPresetSummaryEntry[] = [
  { id: 'preset_1', name: '日式书房', nodeCount: 12 },
  { id: 'preset_2', name: '主卧带衣帽间', nodeCount: 23 },
]

beforeEach(() => {
  for (const k of Object.keys(mockNodes)) delete mockNodes[k]
  mockDeletedNodeIds.length = 0
  mockSelectionLevelId.value = 'level_1'
  mockPresetList.value = []
  vi.clearAllMocks()

  mockNodes['building_1'] = { id: 'building_1', type: 'building', visible: true, metadata: {}, parentId: null, children: ['level_1'] }
  mockNodes['level_1'] = { id: 'level_1', type: 'level', name: 'Level 0', level: 0, visible: true, metadata: {}, parentId: 'building_1', children: ['zone_1'] }
  mockNodes['zone_1'] = { id: 'zone_1', type: 'zone', name: 'Study', visible: true, metadata: {}, parentId: 'level_1', children: [], polygon: [[0, 0], [3, 0], [3, 3], [0, 3]] }
})

// ============================================================================
// isRoomPresetToolCall
// ============================================================================

describe('isRoomPresetToolCall', () => {
  it('identifies the two preset tools and nothing else', () => {
    expect(isRoomPresetToolCall({ tool: 'save_room_preset', roomName: 'x' })).toBe(true)
    expect(isRoomPresetToolCall({ tool: 'insert_room_preset', presetName: 'x' })).toBe(true)
    expect(isRoomPresetToolCall({ tool: 'add_wall', start: [0, 0], end: [1, 0] } as any)).toBe(false)
    expect(isRoomPresetToolCall({ tool: 'ask_user', question: '?' } as any)).toBe(false)
  })
})

// ============================================================================
// save_room_preset execution
// ============================================================================

describe('executeRoomPresetToolCalls — save_room_preset', () => {
  it('calls provider.save with the resolved zoneId + zone name and reports success', async () => {
    mockSave.mockResolvedValue({ ok: true, presetId: 'preset_new' })

    const result = await executeRoomPresetToolCalls(
      [{ tool: 'save_room_preset', roomName: 'study' }],
      'msg_1',
    )

    expect(mockSave).toHaveBeenCalledTimes(1)
    expect(mockSave).toHaveBeenCalledWith('zone_1', 'Study')
    expect(result.success).toBe(true)
    expect(result.toolName).toBe('save_room_preset')
    expect(result.summary).toContain('Room "Study" was saved as preset')
    expect(result.summary).toContain('preset_new')

    // UI state: ops recorded on the message + confirmed
    expect(mockSetOperations).toHaveBeenCalledWith('msg_1', expect.any(Array))
    expect(mockConfirmOperations).toHaveBeenCalledWith('msg_1')
    // No scene nodes created → no operation log, no selection change
    expect(mockAddOperationLog).not.toHaveBeenCalled()
    expect(mockSetSelection).not.toHaveBeenCalled()
    // Telemetry fired with the validated status
    expect(mockToolValidated).toHaveBeenCalledWith({ tool: 'save_room_preset', status: 'valid' })
  })

  it('relays the host failure message verbatim (quota etc.)', async () => {
    const quotaMessage = 'Preset quota reached (10/10). Upgrade your plan to save more presets.'
    mockSave.mockResolvedValue({ ok: false, message: quotaMessage })

    const result = await executeRoomPresetToolCalls(
      [{ tool: 'save_room_preset', roomName: 'Study' }],
      'msg_1',
    )

    expect(result.success).toBe(false)
    expect(result.summary).toContain(quotaMessage)
    expect(result.details.errors[0]).toContain(quotaMessage)
    expect(mockRejectOperations).toHaveBeenCalledWith('msg_1')
    expect(mockAddOperationLog).not.toHaveBeenCalled()
  })

  it('does not call the provider when validation fails (no matching room)', async () => {
    const result = await executeRoomPresetToolCalls(
      [{ tool: 'save_room_preset', roomName: 'Garage' }],
      'msg_1',
    )

    expect(mockSave).not.toHaveBeenCalled()
    expect(result.success).toBe(false)
    expect(result.details.errors[0]).toContain('No room matches "Garage"')
    expect(result.details.errors[0]).toContain('"Study"')
  })
})

// ============================================================================
// insert_room_preset execution
// ============================================================================

describe('executeRoomPresetToolCalls — insert_room_preset', () => {
  it('calls provider.insert with presetId + {levelId, position} and records createdNodeIds', async () => {
    mockPresetList.value = PRESETS
    mockInsert.mockImplementation(async () => {
      // Host inserts nodes into the scene store, then reports the roots
      mockNodes['zone_9'] = { id: 'zone_9', type: 'zone', name: '日式书房', visible: true, metadata: {}, parentId: 'level_1', children: ['wall_9'] }
      mockNodes['wall_9'] = { id: 'wall_9', type: 'wall', visible: true, metadata: {}, parentId: 'level_1', children: [] }
      return { ok: true, rootIds: ['zone_9', 'wall_9'] }
    })

    const result = await executeRoomPresetToolCalls(
      [{ tool: 'insert_room_preset', presetName: '书房', position: [4, -2] }],
      'msg_2',
    )

    expect(mockInsert).toHaveBeenCalledTimes(1)
    expect(mockInsert).toHaveBeenCalledWith('preset_1', { levelId: 'level_1', position: [4, -2] })
    expect(result.success).toBe(true)
    expect(result.summary).toContain('Preset "日式书房" was inserted')
    expect(result.details.createdNodeIds).toEqual(['zone_9', 'wall_9'])

    // Operation log recorded with rootIds as createdNodeIds (undo contract)
    expect(mockAddOperationLog).toHaveBeenCalledTimes(1)
    const log = mockAddOperationLog.mock.calls[0]![0] as AIOperationLog
    expect(log.status).toBe('confirmed')
    expect(log.messageId).toBe('msg_2')
    expect(log.createdNodeIds).toEqual(['zone_9', 'wall_9'])
    expect(log.previousSnapshot).toEqual({})
    expect(log.removedNodes).toEqual([])

    // Inserted nodes are auto-selected; scene cache invalidated
    expect(mockSetSelection).toHaveBeenCalledWith({ selectedIds: ['zone_9', 'wall_9'] })
    expect(mockInvalidateSceneCache).toHaveBeenCalled()
    expect(mockConfirmOperations).toHaveBeenCalledWith('msg_2')
  })

  it('undoConfirmedOperation deletes the inserted rootIds (cascade)', async () => {
    mockPresetList.value = PRESETS
    mockInsert.mockImplementation(async () => {
      mockNodes['zone_9'] = { id: 'zone_9', type: 'zone', name: '日式书房', visible: true, metadata: {}, parentId: 'level_1', children: [] }
      return { ok: true, rootIds: ['zone_9'] }
    })

    await executeRoomPresetToolCalls(
      [{ tool: 'insert_room_preset', presetName: '日式书房' }],
      'msg_3',
    )
    const log = mockAddOperationLog.mock.calls[0]![0] as AIOperationLog

    expect(mockNodes['zone_9']).toBeDefined()
    undoConfirmedOperation(log)
    expect(mockDeletedNodeIds).toContain('zone_9')
    expect(mockNodes['zone_9']).toBeUndefined()
  })

  it('filters rootIds that never landed in the scene store', async () => {
    mockPresetList.value = PRESETS
    mockInsert.mockImplementation(async () => {
      mockNodes['zone_9'] = { id: 'zone_9', type: 'zone', name: '日式书房', visible: true, metadata: {}, parentId: 'level_1', children: [] }
      // 'phantom_1' reported but never created
      return { ok: true, rootIds: ['zone_9', 'phantom_1'] }
    })

    const result = await executeRoomPresetToolCalls(
      [{ tool: 'insert_room_preset', presetName: '日式书房' }],
      'msg_4',
    )

    expect(result.details.createdNodeIds).toEqual(['zone_9'])
    const log = mockAddOperationLog.mock.calls[0]![0] as AIOperationLog
    expect(log.createdNodeIds).toEqual(['zone_9'])
  })

  it('fails loudly when the provider says ok but ZERO nodes landed (truth-in-reporting)', async () => {
    // QA-AI 2026-06-12 BUG-1: an intermittent host-side revert (save-conflict
    // reload racing the insert) left the scene unchanged while the provider
    // returned ok+rootIds — the LLM then told the user the room was inserted.
    // Zero landed ids must be reported as failure, never success.
    mockPresetList.value = PRESETS
    mockInsert.mockResolvedValue({ ok: true, rootIds: ['phantom_a', 'phantom_b'] })

    const result = await executeRoomPresetToolCalls(
      [{ tool: 'insert_room_preset', presetName: '日式书房' }],
      'msg_zero',
    )

    expect(result.success).toBe(false)
    expect(result.summary).toContain('did not take effect')
    expect(result.details.createdNodeIds).toEqual([])
    // No op log and no selection for a failed insert
    expect(mockAddOperationLog).not.toHaveBeenCalled()
    expect(mockSetSelection).not.toHaveBeenCalled()
  })

  it('relays host failure messages and records no log/selection', async () => {
    mockPresetList.value = PRESETS
    const failMessage = 'Preset no longer exists — it may have been deleted on another device.'
    mockInsert.mockResolvedValue({ ok: false, message: failMessage })

    const result = await executeRoomPresetToolCalls(
      [{ tool: 'insert_room_preset', presetName: '日式书房' }],
      'msg_5',
    )

    expect(result.success).toBe(false)
    expect(result.summary).toContain(failMessage)
    expect(mockAddOperationLog).not.toHaveBeenCalled()
    expect(mockSetSelection).not.toHaveBeenCalled()
    expect(mockRejectOperations).toHaveBeenCalledWith('msg_5')
  })

  it('does not call the provider when the preset list is empty', async () => {
    mockPresetList.value = []
    const result = await executeRoomPresetToolCalls(
      [{ tool: 'insert_room_preset', presetName: '书房' }],
      'msg_6',
    )

    expect(mockInsert).not.toHaveBeenCalled()
    expect(result.success).toBe(false)
    expect(result.details.errors[0]).toContain('not saved any room presets')
  })
})

// ============================================================================
// Mixed batch — sequential execution, aggregate result
// ============================================================================

describe('executeRoomPresetToolCalls — batches', () => {
  it('executes save then insert sequentially and aggregates counts', async () => {
    mockPresetList.value = PRESETS
    mockSave.mockResolvedValue({ ok: true, presetId: 'preset_new' })
    mockInsert.mockImplementation(async () => {
      mockNodes['zone_9'] = { id: 'zone_9', type: 'zone', visible: true, metadata: {}, parentId: 'level_1', children: [] }
      return { ok: true, rootIds: ['zone_9'] }
    })

    const result = await executeRoomPresetToolCalls(
      [
        { tool: 'save_room_preset', roomName: 'Study' },
        { tool: 'insert_room_preset', presetName: '主卧' },
      ],
      'msg_7',
    )

    expect(mockSave).toHaveBeenCalledTimes(1)
    expect(mockInsert).toHaveBeenCalledTimes(1)
    expect(result.success).toBe(true)
    expect(result.toolName).toBe('save_room_preset+insert_room_preset')
    expect(result.details.validCount).toBe(2)
    expect(result.details.invalidCount).toBe(0)
  })

  it('partial failure: aggregate success=false, both details present', async () => {
    mockPresetList.value = PRESETS
    mockSave.mockResolvedValue({ ok: true, presetId: 'preset_new' })

    const result = await executeRoomPresetToolCalls(
      [
        { tool: 'save_room_preset', roomName: 'Study' },
        { tool: 'insert_room_preset', presetName: 'Garage' }, // no match
      ],
      'msg_8',
    )

    expect(result.success).toBe(false)
    expect(result.details.validCount).toBe(1)
    expect(result.details.invalidCount).toBe(1)
    // Any success → message ops confirmed (the save DID happen)
    expect(mockConfirmOperations).toHaveBeenCalledWith('msg_8')
  })

  it('works without a messageId (no store writes, result still returned)', async () => {
    mockSave.mockResolvedValue({ ok: true })
    const result = await executeRoomPresetToolCalls(
      [{ tool: 'save_room_preset', roomName: 'Study' }],
      null,
    )
    expect(result.success).toBe(true)
    expect(mockSetOperations).not.toHaveBeenCalled()
    expect(mockConfirmOperations).not.toHaveBeenCalled()
  })
})
