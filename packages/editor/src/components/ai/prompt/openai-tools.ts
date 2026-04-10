import type { ChatCompletionTool } from 'openai/resources/chat/completions'

// ============================================================================
// OpenAI Tool Definitions
// Shared between open-source editor and SaaS.
// ============================================================================

export const OPENAI_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'add_item',
      description: 'Add a furniture item from the catalog to the scene. Use when you are confident about the placement.',
      parameters: {
        type: 'object',
        properties: {
          catalogSlug: { type: 'string', description: 'The catalog item ID (e.g., "sofa", "dining-table", "ceiling-lamp")' },
          position: { type: 'array', items: { type: 'number' }, description: 'Position in meters [x, y, z]. Y is up (usually 0 for floor items).' },
          rotationY: { type: 'number', description: 'Y-axis rotation in radians. Against-wall items should face away from wall.' },
          description: { type: 'string', description: 'Brief description of why this item was placed here.' },
        },
        required: ['catalogSlug', 'position', 'rotationY'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_item',
      description: 'Remove a furniture item from the scene.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'The node ID of the item to remove.' },
          reason: { type: 'string', description: 'Brief reason for removing.' },
        },
        required: ['nodeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'move_item',
      description: 'Move or rotate an existing furniture item.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'The node ID of the item to move.' },
          position: { type: 'array', items: { type: 'number' }, description: 'New position in meters [x, y, z].' },
          rotationY: { type: 'number', description: 'New Y-axis rotation in radians.' },
          reason: { type: 'string', description: 'Brief reason for the move.' },
        },
        required: ['nodeId', 'position'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_material',
      description: 'Change the material/color of a furniture item.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'The node ID of the item.' },
          material: { type: 'string', description: 'Material identifier or color value.' },
          reason: { type: 'string', description: 'Brief reason for the change.' },
        },
        required: ['nodeId', 'material'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_wall',
      description: 'Create a wall segment. Walls snap to 0.5m grid.',
      parameters: {
        type: 'object',
        properties: {
          start: { type: 'array', items: { type: 'number' }, description: 'Start point [x, z] in meters.' },
          end: { type: 'array', items: { type: 'number' }, description: 'End point [x, z] in meters.' },
          thickness: { type: 'number', description: 'Wall thickness in meters (default: 0.2).' },
          height: { type: 'number', description: 'Wall height in meters (default: 2.8).' },
          description: { type: 'string', description: 'Brief description of this wall.' },
        },
        required: ['start', 'end'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_door',
      description: 'Add a door to an existing wall. Positioned using positionAlongWall (meters from wall start).',
      parameters: {
        type: 'object',
        properties: {
          wallId: { type: 'string', description: 'The node ID of the wall.' },
          positionAlongWall: { type: 'number', description: 'Position along wall in meters from start.' },
          width: { type: 'number', description: 'Door width in meters (default: 0.9).' },
          height: { type: 'number', description: 'Door height in meters (default: 2.1).' },
          side: { type: 'string', enum: ['front', 'back'], description: 'Which side of the wall the door faces.' },
          hingesSide: { type: 'string', enum: ['left', 'right'], description: 'Which side the hinges are on.' },
          swingDirection: { type: 'string', enum: ['inward', 'outward'], description: 'Door swing direction.' },
          description: { type: 'string', description: 'Brief description.' },
        },
        required: ['wallId', 'positionAlongWall'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_window',
      description: 'Add a window to an existing wall. Positioned using positionAlongWall (meters from wall start).',
      parameters: {
        type: 'object',
        properties: {
          wallId: { type: 'string', description: 'The node ID of the wall.' },
          positionAlongWall: { type: 'number', description: 'Position along wall in meters from start.' },
          heightFromFloor: { type: 'number', description: 'Height of window center from floor (default: 1.2).' },
          width: { type: 'number', description: 'Window width in meters (default: 1.5).' },
          height: { type: 'number', description: 'Window height in meters (default: 1.5).' },
          side: { type: 'string', enum: ['front', 'back'], description: 'Which side of the wall the window faces.' },
          description: { type: 'string', description: 'Brief description.' },
        },
        required: ['wallId', 'positionAlongWall'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_wall',
      description: 'Update properties of an existing wall (height, thickness, start/end points). Preserves all doors and windows on the wall.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'The node ID of the wall to update.' },
          height: { type: 'number', description: 'New wall height in meters.' },
          thickness: { type: 'number', description: 'New wall thickness in meters.' },
          start: { type: 'array', items: { type: 'number' }, description: 'New start point [x, z] in meters.' },
          end: { type: 'array', items: { type: 'number' }, description: 'New end point [x, z] in meters.' },
          reason: { type: 'string', description: 'Brief reason for the change.' },
        },
        required: ['nodeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_door',
      description: 'Update properties of an existing door (width, height, position, swing). Preserves the door on its wall.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'The node ID of the door to update.' },
          width: { type: 'number', description: 'New door width in meters.' },
          height: { type: 'number', description: 'New door height in meters.' },
          positionAlongWall: { type: 'number', description: 'New position along wall in meters from start.' },
          side: { type: 'string', enum: ['front', 'back'], description: 'Which side of the wall the door faces.' },
          hingesSide: { type: 'string', enum: ['left', 'right'], description: 'Which side the hinges are on.' },
          swingDirection: { type: 'string', enum: ['inward', 'outward'], description: 'Door swing direction.' },
          reason: { type: 'string', description: 'Brief reason for the change.' },
        },
        required: ['nodeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_window',
      description: 'Update properties of an existing window (width, height, position).',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'The node ID of the window to update.' },
          width: { type: 'number', description: 'New window width in meters.' },
          height: { type: 'number', description: 'New window height in meters.' },
          positionAlongWall: { type: 'number', description: 'New position along wall in meters from start.' },
          heightFromFloor: { type: 'number', description: 'Height of window center from floor.' },
          side: { type: 'string', enum: ['front', 'back'], description: 'Which side of the wall the window faces.' },
          reason: { type: 'string', description: 'Brief reason for the change.' },
        },
        required: ['nodeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_node',
      description: 'Remove any scene node (wall, door, window, or item).',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'The node ID to remove.' },
          reason: { type: 'string', description: 'Brief reason for removing.' },
        },
        required: ['nodeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_level',
      description: 'Create a new level (floor) in the current building. The level number is auto-incremented. After creation, subsequent operations apply to this new level.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Optional name for the level (e.g., "Second Floor").' },
          description: { type: 'string', description: 'Brief description.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_slab',
      description: 'Create a floor slab (horizontal plate) from a polygon. Used for multi-level buildings to define floor plates.',
      parameters: {
        type: 'object',
        properties: {
          polygon: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: 'Boundary polygon as array of [x, z] points in meters.' },
          elevation: { type: 'number', description: 'Slab elevation (Y position) in meters (default: 0.05).' },
          holes: { type: 'array', items: { type: 'array', items: { type: 'array', items: { type: 'number' } } }, description: 'Optional holes in the slab as arrays of [x, z] polygons.' },
          description: { type: 'string', description: 'Brief description.' },
        },
        required: ['polygon'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_slab',
      description: 'Update properties of an existing slab (elevation, polygon).',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'The node ID of the slab to update.' },
          elevation: { type: 'number', description: 'New slab elevation in meters.' },
          polygon: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: 'New boundary polygon as array of [x, z] points.' },
          reason: { type: 'string', description: 'Brief reason for the change.' },
        },
        required: ['nodeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_ceiling',
      description: "Create a flat ceiling panel from a polygon. Typically covers a room or zone boundary. polygon is optional — if omitted, the system will automatically use the active zone's boundary.",
      parameters: {
        type: 'object',
        properties: {
          polygon: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: 'Ceiling boundary polygon as array of [x, z] points in meters. Optional — if omitted, the system auto-detects from the active zone boundary.' },
          height: { type: 'number', description: 'Ceiling height in meters (default: 2.5).' },
          material: { type: 'string', description: 'Material identifier or color value.' },
          description: { type: 'string', description: 'Brief description.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_ceiling',
      description: 'Update properties of an existing ceiling (height, material).',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'The node ID of the ceiling to update.' },
          height: { type: 'number', description: 'New ceiling height in meters.' },
          material: { type: 'string', description: 'New material identifier or color value.' },
          reason: { type: 'string', description: 'Brief reason for the change.' },
        },
        required: ['nodeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_roof',
      description: 'Create a roof structure. Supports 7 types: hip, gable, shed, gambrel, dutch, mansard, flat. Creates a RoofNode container with one RoofSegment inside.',
      parameters: {
        type: 'object',
        properties: {
          position: { type: 'array', items: { type: 'number' }, description: 'Center position [x, y, z] in meters.' },
          width: { type: 'number', description: 'Roof width in meters.' },
          depth: { type: 'number', description: 'Roof depth in meters.' },
          roofType: { type: 'string', enum: ['hip', 'gable', 'shed', 'gambrel', 'dutch', 'mansard', 'flat'], description: 'Type of roof.' },
          roofHeight: { type: 'number', description: 'Roof peak height in meters (default: 2.5).' },
          wallHeight: { type: 'number', description: 'Wall height below roof in meters (default: 0.5).' },
          overhang: { type: 'number', description: 'Eave overhang in meters (default: 0.3).' },
          description: { type: 'string', description: 'Brief description.' },
        },
        required: ['position', 'width', 'depth', 'roofType'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_roof',
      description: 'Update properties of an existing roof segment (type, dimensions).',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'The node ID of the roof segment to update.' },
          roofType: { type: 'string', enum: ['hip', 'gable', 'shed', 'gambrel', 'dutch', 'mansard', 'flat'], description: 'New roof type.' },
          roofHeight: { type: 'number', description: 'New roof peak height in meters.' },
          wallHeight: { type: 'number', description: 'New wall height in meters.' },
          width: { type: 'number', description: 'New width in meters.' },
          depth: { type: 'number', description: 'New depth in meters.' },
          reason: { type: 'string', description: 'Brief reason for the change.' },
        },
        required: ['nodeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_stair',
      description: 'Create a staircase with one stair flight. The stair is placed at the given position and connects the current level to the one above. Creates a StairNode container with one StairSegment inside.',
      parameters: {
        type: 'object',
        properties: {
          position: { type: 'array', items: { type: 'number' }, description: 'Position [x, y, z] in meters where the stair starts.' },
          rotationY: { type: 'number', description: 'Rotation around Y axis in radians (default: 0). 0 = stairs go toward +Z.' },
          width: { type: 'number', description: 'Stair width in meters (default: 1.0). Range: 0.5-5.0.' },
          length: { type: 'number', description: 'Horizontal run distance in meters (default: 3.0). Range: 0.5-10.0.' },
          height: { type: 'number', description: 'Vertical rise in meters (default: 2.5). Should match floor-to-floor height. Range: 0.5-10.0.' },
          stepCount: { type: 'integer', description: 'Number of steps (default: 10). Range: 2-30.' },
          description: { type: 'string', description: 'Brief description of this staircase.' },
        },
        required: ['position'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_stair',
      description: 'Update properties of an existing staircase (position, rotation, dimensions, step count). Changes apply to the stair container and its first segment.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'The node ID of the stair to update.' },
          position: { type: 'array', items: { type: 'number' }, description: 'New position [x, y, z] in meters.' },
          rotationY: { type: 'number', description: 'New rotation around Y axis in radians.' },
          width: { type: 'number', description: 'New stair width in meters (0.5-5.0).' },
          length: { type: 'number', description: 'New horizontal run in meters (0.5-10.0).' },
          height: { type: 'number', description: 'New vertical rise in meters (0.5-10.0).' },
          stepCount: { type: 'integer', description: 'New number of steps (2-30).' },
          reason: { type: 'string', description: 'Brief reason for the change.' },
        },
        required: ['nodeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_zone',
      description: 'Manually create a room/zone from a polygon. Zones are usually auto-detected from walls, but this allows manual zone creation.',
      parameters: {
        type: 'object',
        properties: {
          polygon: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: 'Zone boundary polygon as array of [x, z] points in meters.' },
          name: { type: 'string', description: 'Zone name (e.g., "Living Room", "Kitchen").' },
          description: { type: 'string', description: 'Brief description.' },
        },
        required: ['polygon'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_zone',
      description: 'Update properties of an existing zone (polygon, name).',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'The node ID of the zone to update.' },
          polygon: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: 'New boundary polygon as array of [x, z] points.' },
          name: { type: 'string', description: 'New zone name.' },
          reason: { type: 'string', description: 'Brief reason for the change.' },
        },
        required: ['nodeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_building',
      description: 'Create a new building in the scene. Automatically includes Level 0. Use when the scene needs multiple separate buildings.',
      parameters: {
        type: 'object',
        properties: {
          position: { type: 'array', items: { type: 'number' }, description: 'Building position [x, y, z] in meters (default: [0, 0, 0]).' },
          name: { type: 'string', description: 'Building name.' },
          description: { type: 'string', description: 'Brief description.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_site',
      description: 'Update the site boundary polygon.',
      parameters: {
        type: 'object',
        properties: {
          polygon: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: 'New site boundary polygon as array of [x, z] points in meters.' },
          reason: { type: 'string', description: 'Brief reason for the change.' },
        },
        required: ['polygon'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_scan',
      description: 'Add a 3D scan or reference model to the scene.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to the 3D model file.' },
          position: { type: 'array', items: { type: 'number' }, description: 'Position [x, y, z] in meters (default: [0, 0, 0]).' },
          scale: { type: 'number', description: 'Uniform scale factor (default: 1).' },
          opacity: { type: 'number', description: 'Opacity 0-1 (default: 0.5).' },
          description: { type: 'string', description: 'Brief description.' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_guide',
      description: 'Add a reference guide (floor plan image or guide overlay) to the scene.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to the guide image or model file.' },
          position: { type: 'array', items: { type: 'number' }, description: 'Position [x, y, z] in meters (default: [0, 0, 0]).' },
          scale: { type: 'number', description: 'Uniform scale factor (default: 1).' },
          opacity: { type: 'number', description: 'Opacity 0-1 (default: 0.5).' },
          description: { type: 'string', description: 'Brief description.' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_item',
      description: 'Update properties of an existing furniture item (scale). Use move_item for position changes.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'The node ID of the item to update.' },
          scale: { type: 'array', items: { type: 'number' }, description: 'New scale [x, y, z] (e.g., [1.5, 1.5, 1.5] for 150%).' },
          reason: { type: 'string', description: 'Brief reason for the change.' },
        },
        required: ['nodeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'move_building',
      description: 'Move and/or rotate an entire building on the site. All internal elements (walls, doors, furniture) move with it.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'The building node ID to move.' },
          position: { type: 'array', items: { type: 'number' }, description: 'New site position [x, y, z] in meters.' },
          rotationY: { type: 'number', description: 'New Y-axis rotation in radians (e.g., Math.PI/2 for 90°).' },
          reason: { type: 'string', description: 'Brief reason for moving.' },
        },
        required: ['nodeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'clone_level',
      description: 'Clone an entire floor (level) including all walls, doors, windows, furniture, and slabs. Creates a new level with fresh IDs. Use for duplicating floor layouts in multi-story buildings.',
      parameters: {
        type: 'object',
        properties: {
          levelId: { type: 'string', description: 'The level node ID to clone (from scene context, e.g., "level_abc123").' },
          name: { type: 'string', description: 'Name for the new cloned level (e.g., "Level 2").' },
          description: { type: 'string', description: 'Brief description of why this level is being cloned.' },
        },
        required: ['levelId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'enter_walkthrough',
      description: 'Enter first-person walkthrough mode so the user can explore the building from ground level. Use after completing a design to let the user preview it.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Brief reason for entering walkthrough mode.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'batch_operations',
      description: 'Execute multiple operations at once. Use for room creation, room setups, or any multi-step operation.',
      parameters: {
        type: 'object',
        properties: {
          operations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['add_item', 'remove_item', 'move_item', 'update_material', 'update_item', 'add_wall', 'update_wall', 'add_door', 'update_door', 'add_window', 'update_window', 'remove_node', 'add_level', 'add_slab', 'update_slab', 'add_ceiling', 'update_ceiling', 'add_roof', 'update_roof', 'add_zone', 'update_zone', 'add_building', 'update_site', 'add_scan', 'add_guide', 'move_building', 'clone_level'] },
                catalogSlug: { type: 'string' }, nodeId: { type: 'string' },
                position: { type: 'array', items: { type: 'number' } }, rotationY: { type: 'number' },
                material: { type: 'string' },
                start: { type: 'array', items: { type: 'number' } }, end: { type: 'array', items: { type: 'number' } },
                thickness: { type: 'number' }, height: { type: 'number' },
                wallId: { type: 'string' }, positionAlongWall: { type: 'number' }, heightFromFloor: { type: 'number' },
                width: { type: 'number' }, side: { type: 'string' }, hingesSide: { type: 'string' }, swingDirection: { type: 'string' },
                description: { type: 'string' }, reason: { type: 'string' },
              },
            },
          },
          description: { type: 'string', description: 'Summary of what this batch does.' },
        },
        required: ['operations', 'description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_placement',
      description: 'Present 2-3 placement options to the user for confirmation.',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'The question to ask the user.' },
          options: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' }, label: { type: 'string' }, catalogSlug: { type: 'string' },
                position: { type: 'array', items: { type: 'number' } }, rotationY: { type: 'number' },
                reason: { type: 'string' },
              },
              required: ['id', 'label', 'catalogSlug', 'position', 'rotationY', 'reason'],
            },
          },
        },
        required: ['question', 'options'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ask_user',
      description: 'Ask the user a clarifying question when the request is ambiguous.',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'The question to ask.' },
          suggestions: { type: 'array', items: { type: 'string' }, description: 'Optional suggested responses.' },
        },
        required: ['question'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'confirm_preview',
      description: 'Confirm and apply the current ghost preview.',
      parameters: { type: 'object', properties: { reason: { type: 'string' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reject_preview',
      description: 'Reject and discard the current ghost preview.',
      parameters: { type: 'object', properties: { reason: { type: 'string' } } },
    },
  },
]
