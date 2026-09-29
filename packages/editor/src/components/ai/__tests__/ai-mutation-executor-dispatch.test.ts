/**
 * validateToolCall dispatch coverage.
 *
 * For each MUTATION tool name listed in OPENAI_TOOLS, validateToolCall MUST
 * return a non-empty array of ValidatedOperation entries (status may be valid,
 * adjusted, or invalid — but never empty). An empty return means the mutation
 * intent silently dropped, which has happened historically (see add_elevator
 * stream-client regression).
 *
 * For the 5 NON-MUTATION tools (propose_placement, ask_user, confirm_preview,
 * reject_preview, enter_walkthrough) the contract is explicitly to return [].
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockNodes: Record<string, unknown> = {}
const mockSelection = { levelId: 'level-1' }

const mockCatalog = new Set<string>(['wall-wood1', 'wall-brick1', 'roof-tile1', 'stair-wood1'])
vi.mock('@aedifex/core', () => ({
  useScene: { getState: () => ({ nodes: mockNodes }) },
  spatialGridManager: {
    canPlaceOnFloor: vi.fn(() => ({ valid: true, conflictIds: [] })),
    getSlabElevationForItem: vi.fn(() => 0),
    getSlabElevationAt: vi.fn(() => 0),
  },
  getCatalogMaterialById: (id?: string) => (id && mockCatalog.has(id) ? { id, label: id } : undefined),
  // validateRemoveNode consults the schema registry to decide if a type is deletable.
  // Stub returns a permissive definition so dispatch reaches success.
  nodeRegistry: {
    get: (_type: string) => ({ deletable: true, capabilities: { deletable: true } }),
  },
  // align_opening_to_nearest calls this. Stub returns a canned "1 sibling to
  // the right, at center-align" so dispatch reaches success.
  computeOpeningGuides: vi.fn(() => ({
    sillHead: null,
    gaps: [],
    alongWall: { s: 1.5, movingFeature: 'center', targetId: 'sibling_1', targetFeature: 'center', snap: 0.2 },
    vertical: null,
    equalSpacing: null,
  })),
}))

vi.mock('@aedifex/viewer', () => ({
  useViewer: { getState: () => ({ selection: mockSelection }) },
}))

vi.mock('../ai-catalog-resolver', () => ({
  resolveCatalogSlug: vi.fn((slug: string) => {
    if (slug === 'sofa-modern') {
      return {
        asset: {
          id: 'sofa-modern', name: 'Modern Sofa', category: 'furniture',
          dimensions: [2.2, 0.9, 0.9], src: '', thumbnail: '',
          scale: [1, 1, 1], offset: [0, 0, 0], rotation: [0, 0, 0],
        },
        matchType: 'exact',
      }
    }
    return { asset: null, matchType: 'none', suggestions: [] }
  }),
}))

import { validateToolCall } from '../ai-mutation-executor'
import type { AIToolCall } from '../types'

beforeEach(() => {
  for (const k of Object.keys(mockNodes)) delete mockNodes[k]
  // Pre-populate a wall + level + item the various validators can target so we
  // don't get cascading "node not found" failures masking dispatch holes.
  mockNodes['wall_1'] = { id: 'wall_1', type: 'wall', visible: true, parentId: 'level_1', children: [], start: [0, 0], end: [3, 0], thickness: 0.2, height: 2.8 }
  mockNodes['level_1'] = { id: 'level_1', type: 'level', visible: true, parentId: 'building_1', children: ['wall_1'], level: 0 }
  mockNodes['building_1'] = { id: 'building_1', type: 'building', visible: true, parentId: 'site_1', children: ['level_1'], position: [0, 0, 0] }
  mockNodes['site_1'] = { id: 'site_1', type: 'site', visible: true, parentId: null, children: ['building_1'] }
  mockNodes['item_1'] = { id: 'item_1', type: 'item', visible: true, name: 'Existing Item', position: [0, 0, 0], rotation: [0, 0, 0], asset: { id: 'sofa-modern', name: 'Modern Sofa', category: 'furniture', dimensions: [2.2, 0.9, 0.9], src: '', thumbnail: '', scale: [1, 1, 1], offset: [0, 0, 0], rotation: [0, 0, 0] } }
  mockNodes['slab_1'] = { id: 'slab_1', type: 'slab', visible: true, parentId: 'level_1', polygon: [[0, 0], [3, 0], [3, 3], [0, 3]] }
  mockNodes['ceiling_1'] = { id: 'ceiling_1', type: 'ceiling', visible: true, parentId: 'level_1', polygon: [[0, 0], [3, 0], [3, 3], [0, 3]], height: 2.8 }
  mockNodes['roof_1'] = { id: 'roof_1', type: 'roof', visible: true, parentId: 'level_1', children: ['rseg_1'] }
  mockNodes['rseg_1'] = { id: 'rseg_1', type: 'roof-segment', visible: true, parentId: 'roof_1', width: 3, depth: 3, roofType: 'gable', roofHeight: 2, wallHeight: 0.5, overhang: 0.3 }
  mockNodes['stair_1'] = { id: 'stair_1', type: 'stair', visible: true, parentId: 'level_1' }
  mockNodes['zone_1'] = { id: 'zone_1', type: 'zone', visible: true, parentId: 'level_1', polygon: [[0, 0], [1, 0], [1, 1], [0, 1]] }
  mockNodes['fence_1'] = { id: 'fence_1', type: 'fence', visible: true, parentId: 'level_1', start: [0, 0], end: [2, 0] }
  mockNodes['door_1'] = { id: 'door_1', type: 'door', visible: true, parentId: 'wall_1', wallId: 'wall_1', position: [1, 1, 0], width: 0.9, height: 2.1, side: 'front' }
  mockNodes['window_1'] = { id: 'window_1', type: 'window', visible: true, parentId: 'wall_1', wallId: 'wall_1', position: [2, 1.2, 0], width: 1, height: 1, side: 'front' }
  // Give the wall a sibling opening so the align validator's guides result
  // has something to snap onto.
  ;(mockNodes['wall_1'] as { children: string[] }).children = ['door_1', 'window_1']
  // HVAC equipment endpoints so add_lineset / add_liquid_line dispatch resolves.
  mockNodes['hvac_out'] = { id: 'hvac_out', type: 'hvac-equipment', visible: true, parentId: 'level_1', position: [5, 0, 0] }
  mockNodes['hvac_in'] = { id: 'hvac_in', type: 'hvac-equipment', visible: true, parentId: 'level_1', position: [0, 0, 5] }
  vi.clearAllMocks()
})

// ============================================================================
// Sample payloads for every mutation tool name. Designed to be minimal-valid
// (or close enough that the validator runs to completion). We do NOT assert
// status — we only assert that validateToolCall returns at least one entry.
// ============================================================================

function payload(name: string): AIToolCall {
  switch (name) {
    case 'add_item':
      return { tool: 'add_item', catalogSlug: 'sofa-modern', position: [0, 0, 0], rotationY: 0 } as AIToolCall
    case 'remove_item':
      return { tool: 'remove_item', nodeId: 'item_1' } as AIToolCall
    case 'move_item':
      return { tool: 'move_item', nodeId: 'item_1', position: [2, 0, 2] } as AIToolCall
    case 'update_material':
      return { tool: 'update_material', nodeId: 'item_1', material: 'wall-wood1' } as AIToolCall
    case 'add_wall':
      return { tool: 'add_wall', start: [0, 0], end: [3, 0] } as AIToolCall
    case 'add_door':
      return { tool: 'add_door', wallId: 'wall_1', positionAlongWall: 1.0 } as AIToolCall
    case 'add_window':
      return { tool: 'add_window', wallId: 'wall_1', positionAlongWall: 2.0 } as AIToolCall
    case 'update_wall':
      return { tool: 'update_wall', nodeId: 'wall_1', height: 3.0 } as AIToolCall
    case 'update_door':
      return { tool: 'update_door', nodeId: 'door_1', width: 1.0 } as AIToolCall
    case 'update_window':
      return { tool: 'update_window', nodeId: 'window_1', width: 1.2 } as AIToolCall
    case 'remove_node':
      return { tool: 'remove_node', nodeId: 'wall_1' } as AIToolCall
    case 'add_level':
      return { tool: 'add_level' } as AIToolCall
    case 'add_slab':
      return { tool: 'add_slab', polygon: [[0, 0], [3, 0], [3, 3], [0, 3]] } as AIToolCall
    case 'update_slab':
      return { tool: 'update_slab', nodeId: 'slab_1', elevation: 0.1 } as AIToolCall
    case 'add_ceiling':
      return { tool: 'add_ceiling', polygon: [[0, 0], [3, 0], [3, 3], [0, 3]] } as AIToolCall
    case 'update_ceiling':
      return { tool: 'update_ceiling', nodeId: 'ceiling_1', height: 3 } as AIToolCall
    case 'add_roof':
      return { tool: 'add_roof', position: [0, 0, 0], width: 3, depth: 3, roofType: 'gable' } as AIToolCall
    case 'update_roof':
      return { tool: 'update_roof', nodeId: 'rseg_1', roofHeight: 2.5 } as AIToolCall
    case 'add_stair':
      return { tool: 'add_stair', position: [0, 0, 0] } as AIToolCall
    case 'update_stair':
      return { tool: 'update_stair', nodeId: 'stair_1', width: 1.2 } as AIToolCall
    case 'add_elevator':
      return { tool: 'add_elevator', position: [3, 0, 3] } as AIToolCall
    case 'add_zone':
      return { tool: 'add_zone', polygon: [[0, 0], [1, 0], [1, 1], [0, 1]] } as AIToolCall
    case 'update_zone':
      return { tool: 'update_zone', nodeId: 'zone_1', name: 'Living' } as AIToolCall
    case 'add_building':
      return { tool: 'add_building', position: [0, 0, 0] } as AIToolCall
    case 'update_site':
      return { tool: 'update_site', polygon: [[0, 0], [10, 0], [10, 10], [0, 10]] } as AIToolCall
    case 'add_scan':
      return { tool: 'add_scan', url: 'https://example.com/scan.glb' } as AIToolCall
    case 'add_guide':
      return { tool: 'add_guide', url: 'https://example.com/guide.png' } as AIToolCall
    case 'update_item':
      return { tool: 'update_item', nodeId: 'item_1', scale: [1.5, 1.5, 1.5] } as AIToolCall
    case 'move_building':
      return { tool: 'move_building', nodeId: 'building_1', position: [1, 0, 1] } as AIToolCall
    case 'clone_level':
      return { tool: 'clone_level', levelId: 'level_1' } as AIToolCall
    case 'add_fence':
      return { tool: 'add_fence', start: [0, 0], end: [3, 0] } as AIToolCall
    case 'update_fence':
      return { tool: 'update_fence', nodeId: 'fence_1', height: 1.5 } as AIToolCall
    case 'add_cut_out':
      return { tool: 'add_cut_out', nodeId: 'slab_1', hole: [[0.5, 0.5], [1.5, 0.5], [1.5, 1.5], [0.5, 1.5]] } as AIToolCall
    case 'add_roof_accessory':
      return { tool: 'add_roof_accessory', kind: 'chimney', roofSegmentId: 'rseg_1', position: [0, 0, 0] } as AIToolCall
    case 'update_wall_material':
      return { tool: 'update_wall_material', nodeId: 'wall_1', side: 'interior', materialPreset: 'wall-wood1' } as AIToolCall
    case 'update_roof_material':
      return { tool: 'update_roof_material', nodeId: 'roof_1', role: 'top', materialPreset: 'roof-tile1' } as AIToolCall
    case 'update_stair_material':
      return { tool: 'update_stair_material', nodeId: 'stair_1', role: 'tread', materialPreset: 'stair-wood1' } as AIToolCall
    case 'paint_slot':
      return { tool: 'paint_slot', nodeId: 'wall_1', slotId: 'interior', materialRef: 'library:preset-charcoal' } as AIToolCall
    case 'add_duct_segment':
      return { tool: 'add_duct_segment', points: [[0, 2.6, 0], [3, 2.6, 0]], crossSection: 'round', diameter: 6 } as AIToolCall
    case 'add_duct_fitting':
      return { tool: 'add_duct_fitting', position: [1, 2.6, 0], fittingType: 'elbow', portSizes: { diameter: 6 } } as AIToolCall
    case 'add_duct_terminal':
      return { tool: 'add_duct_terminal', position: [1, 0, 1], terminalType: 'supply' } as AIToolCall
    case 'add_pipe_segment':
      return { tool: 'add_pipe_segment', points: [[0, -0.2, 0], [3, -0.4, 0]], diameter: 2, pipeKind: 'dwv' } as AIToolCall
    case 'add_pipe_fitting':
      return { tool: 'add_pipe_fitting', position: [1, -0.3, 0], fittingType: 'elbow', diameter: 2 } as AIToolCall
    case 'add_pipe_trap':
      return { tool: 'add_pipe_trap', position: [1, -0.3, 0], diameter: 2 } as AIToolCall
    case 'add_hvac_equipment':
      return { tool: 'add_hvac_equipment', position: [2, 0, 2], equipmentType: 'indoor-unit' } as AIToolCall
    case 'add_lineset':
      return { tool: 'add_lineset', fromId: 'hvac_out', toId: 'hvac_in' } as AIToolCall
    case 'add_liquid_line':
      return { tool: 'add_liquid_line', fromId: 'hvac_out', toId: 'hvac_in' } as AIToolCall
    case 'align_opening_to_nearest':
      return { tool: 'align_opening_to_nearest', nodeId: 'door_1', axis: 'both' } as AIToolCall
    case 'batch_operations':
      return { tool: 'batch_operations', description: '', operations: [{ type: 'add_wall', start: [0, 0], end: [3, 0] }] } as AIToolCall
    case 'save_room_preset':
      return { tool: 'save_room_preset', roomName: 'Zone' } as AIToolCall
    case 'insert_room_preset':
      // Default RoomPresetProvider has an empty list → status='invalid',
      // but the dispatch contract (non-empty result, matching type) holds.
      return { tool: 'insert_room_preset', presetName: 'Study' } as AIToolCall
    default:
      throw new Error(`No payload helper for ${name}`)
  }
}

// Authoritative list mirrors OPENAI_TOOLS in prompt/openai-tools.ts.
const MUTATION_TOOLS = [
  'add_item', 'remove_item', 'move_item', 'update_material',
  'add_wall', 'add_door', 'add_window', 'update_wall', 'update_door', 'update_window',
  'remove_node',
  'add_level', 'add_slab', 'update_slab', 'add_ceiling', 'update_ceiling',
  'add_roof', 'update_roof', 'add_roof_accessory',
  'add_stair', 'update_stair', 'add_elevator',
  'add_zone', 'update_zone',
  'add_building', 'update_site',
  'add_scan', 'add_guide',
  'update_item', 'move_building', 'clone_level',
  'add_fence', 'update_fence', 'add_cut_out',
  'update_wall_material', 'update_roof_material', 'update_stair_material',
  'paint_slot',
  'add_duct_segment', 'add_duct_fitting', 'add_duct_terminal',
  'add_pipe_segment', 'add_pipe_fitting', 'add_pipe_trap',
  'add_hvac_equipment', 'add_lineset', 'add_liquid_line',
  'align_opening_to_nearest',
  'batch_operations',
  'save_room_preset', 'insert_room_preset',
] as const

const NON_MUTATION_TOOLS = [
  'propose_placement', 'ask_user', 'confirm_preview', 'reject_preview', 'enter_walkthrough',
] as const

describe('validateToolCall — dispatch covers every mutation tool name', () => {
  it.each(MUTATION_TOOLS)('%s dispatches to a validator (non-empty result)', (name) => {
    const result = validateToolCall(payload(name))
    // Each mutation tool must return at least one ValidatedOperation.
    // Empty array means the case fell through and the mutation intent was lost.
    expect(result.length).toBeGreaterThan(0)
    // The returned op type must be either the original tool name OR — for
    // batch_operations — the type of one of its child ops.
    if (name !== 'batch_operations') {
      expect(result[0]!.type).toBe(name)
    }
  })
})

describe('validateToolCall — non-mutation tools return [] (by contract)', () => {
  it.each(NON_MUTATION_TOOLS)('%s deliberately returns empty array', (name) => {
    const call = { tool: name } as unknown as AIToolCall
    const result = validateToolCall(call)
    expect(result).toEqual([])
  })
})
