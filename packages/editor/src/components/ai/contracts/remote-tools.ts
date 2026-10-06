import { sharedAgentContracts } from './shared-agent-tools'

export const SUPPORTED_REMOTE_MCP_TOOL_NAMES = [...new Set([
  ...sharedAgentContracts.keys(),
  'get_scene', 'find_nodes', 'describe_node', 'scene_query', 'apply_patch',
  'undo', 'redo', 'validate_design', 'place_design', 'validate_scene', 'export_json',
  'create_wall', 'place_item', 'add_wall', 'add_level', 'add_slab', 'add_ceiling',
  'add_roof', 'add_stair', 'add_zone', 'add_building', 'add_fence', 'add_scan',
  'add_guide', 'add_cut_out', 'update_wall', 'update_door', 'update_window',
  'update_slab', 'update_ceiling', 'update_roof', 'update_stair', 'update_zone',
  'update_site', 'update_item', 'update_fence', 'update_material', 'update_wall_material',
  'update_roof_material', 'update_stair_material', 'remove_node', 'remove_item',
  'move_item', 'move_building',
])]
