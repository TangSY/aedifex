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
          levelId: { type: 'string', description: 'Target level ID (from scene context). Required for multi-level buildings when targeting a level other than the currently selected one.' },
          outdoor: { type: 'boolean', description: 'Set true ONLY when the user explicitly asks for an outdoor placement (e.g. "在房子外面", "在院子里", "outdoor", landscape items on the site). Default false — items must stay inside a zone polygon and out-of-zone positions will be clamped back inside.' },
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
          levelId: { type: 'string', description: 'Target level ID (from scene context). Required for multi-level buildings when targeting a level other than the currently selected one.' },
          outdoor: { type: 'boolean', description: 'Set true ONLY when the user explicitly asks to move the item outdoors (e.g. "把桌子搬到院子里"). Default false — out-of-zone destinations are clamped back inside the zone.' },
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
      description: 'Whole-node material/color change for furniture, slab, ceiling, fence, door/window. ⚠️ Per-part painting (e.g. window glass vs frame, door panel vs handle, fence rail vs infill) belongs to `paint_slot` — use that instead whenever you target a specific surface. For walls/roofs/stairs the legacy per-role tools (update_wall_material / update_roof_material / update_stair_material) remain for backward compatibility, but `paint_slot` is preferred.',
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
      name: 'update_wall_material',
      description: 'Legacy whole-side wall material — writes `materialPreset` / `material` / interior/exterior single-fields. ⚠️ Prefer `paint_slot` with slotId="interior" or "exterior" for the unified paint-slots model. Use this tool only when you need to set the legacy single-face material (side="both") for backward compatibility with older scenes.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'The node ID of the wall.' },
          side: { type: 'string', enum: ['interior', 'exterior', 'both'], description: 'Which face to apply the material to.' },
          materialPreset: { type: 'string', enum: ['wall-wood1', 'wall-wood2', 'wall-wood3', 'wall-wood4', 'wall-wood5', 'wall-wallpaper1', 'wall-wallpaper2', 'wall-wallpaper3', 'preset-white', 'preset-metal', 'preset-glass'], description: 'Catalog preset ID. Only IDs valid for wall surfaces are allowed. Mutually exclusive with materialColor; if both are provided, preset wins.' },
          materialColor: { type: 'string', description: 'Inline color hex string (e.g. "#aabbcc"). Use when no catalog preset matches.' },
          reason: { type: 'string', description: 'Brief reason for the change.' },
        },
        required: ['nodeId', 'side'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_roof_material',
      description: '⚠️ 仅做整体上色（写 materialPreset 字段）。如需 per-part 上色（山墙面/檐口/披水板/瓦片单独），请改用 paint_slot。Change roof surface material per role: top (sheet), edge (fascia), wall (gable wall under roof). Falls back through node defaults when a role-specific material is not set. Note: roof now supports the paint-slots model via `paint_slot` with slotId="shingle" | "gable" | "fascia" | "soffit" — prefer that tool for per-part painting; this tool remains for whole-role material changes.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'The node ID of the roof container (RoofNode), not a segment.' },
          role: { type: 'string', enum: ['top', 'edge', 'wall'], description: 'Which roof surface role to update.' },
          materialPreset: { type: 'string', enum: ['wall-wood1', 'wall-wood2', 'wall-wood3'], description: 'Catalog preset ID valid for roof surfaces. The catalog has no roof-specific presets yet; these wall woods are roof-targeted. Mutually exclusive with materialColor.' },
          materialColor: { type: 'string', description: 'Inline color hex string.' },
          reason: { type: 'string', description: 'Brief reason for the change.' },
        },
        required: ['nodeId', 'role'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_stair_material',
      description: 'Legacy stair surface material per role: railing, tread (step surface), side (stringer). ⚠️ Prefer `paint_slot` with slotId="treads" / "railing" / "body" for the unified paint-slots model. This tool remains for backward compatibility.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'The node ID of the stair container (StairNode), not a segment.' },
          role: { type: 'string', enum: ['railing', 'tread', 'side'], description: 'Which stair surface role to update.' },
          materialPreset: { type: 'string', enum: ['wall-wood1', 'wall-wood2', 'wall-wood3', 'wall-wood4', 'wall-wood5', 'wall-marble1', 'wall-marble2', 'preset-white'], description: 'Catalog preset ID valid for stair surfaces. The catalog has no stair-specific presets yet; these are stair-targeted woods/marbles. Mutually exclusive with materialColor.' },
          materialColor: { type: 'string', description: 'Inline color hex string.' },
          reason: { type: 'string', description: 'Brief reason for the change.' },
        },
        required: ['nodeId', 'role'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'paint_slot',
      description: 'Unified per-slot paint. Writes a single MaterialRef into node.slots[slotId]. Use this instead of update_*_material when painting per-part (window glass vs frame, stair treads vs railing, fence posts vs infill, door handle vs panel, etc.). Supported kinds and slots: wall (interior, exterior), roof (shingle, gable, fascia, soffit), slab (surface, side), ceiling (surface), stair (treads, body, railing), column (shaft, base, capital, frame), elevator (cab, doors, shaft, glass), fence (posts, infill, base, rail), shelf (shelves, frame, back), door (panel, frame, glass, hardware), window (frame, glass). For item nodes (furniture/GLB), slotId is the GLB mesh-defined name; any string is accepted and resolved at paint time. NOTE: Some slots are conditional on node properties (e.g. fence "base" only exists when baseStyle !== "floating"; column "frame" only when the column is structural; shelf "back" only when the shelf has a back panel). If the validator rejects your call with a "Valid slots" list, retry with one of the listed slot ids instead of guessing.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'Target node ID. The node must already exist.' },
          slotId: { type: 'string', description: 'Slot identifier within the node kind. Per-kind enumeration: wall="interior"|"exterior"; roof="shingle"|"gable"|"fascia"|"soffit"; slab="surface"|"side"; ceiling="surface"; stair="treads"|"body"|"railing"; column="shaft"|"base"|"capital"|"frame"; elevator="cab"|"doors"|"shaft"|"glass"; fence="posts"|"infill"|"base"|"rail"; shelf="shelves"|"frame"|"back"; door="panel"|"frame"|"glass"|"hardware"; window="frame"|"glass". For item/GLB nodes, any mesh-name string is accepted.' },
          materialRef: { type: 'string', description: 'MaterialRef. Use "library:<preset-id>" for a catalog preset (e.g. "library:preset-charcoal", "library:wall-wood1"), or "scene:<id>" for a previously minted scene material. Pass an empty string ("") to clear the slot back to its declared default.' },
          reason: { type: 'string', description: 'Brief reason for the change.' },
        },
        required: ['nodeId', 'slotId', 'materialRef'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_wall',
      description: 'Create a wall segment. Walls snap to 0.5m grid. Pass curveOffset to bend the wall into an arc.',
      parameters: {
        type: 'object',
        properties: {
          start: { type: 'array', items: { type: 'number' }, description: 'Start point [x, z] in meters.' },
          end: { type: 'array', items: { type: 'number' }, description: 'End point [x, z] in meters.' },
          thickness: { type: 'number', description: 'Wall thickness in meters (default: 0.2).' },
          height: { type: 'number', description: 'Wall height in meters (default: 2.8).' },
          curveOffset: { type: 'number', description: 'Optional sagitta offset (meters) at the wall midpoint to bend the wall into an arc. Positive offsets bow toward the wall front, negative toward the back. Omit for a straight wall.' },
          levelId: { type: 'string', description: 'Target level ID (from scene context). Required for multi-level buildings when targeting a level other than the currently selected one.' },
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
      description: 'Update properties of an existing wall (height, thickness, start/end points, curveOffset). Preserves all doors and windows on the wall.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'The node ID of the wall to update.' },
          height: { type: 'number', description: 'New wall height in meters.' },
          thickness: { type: 'number', description: 'New wall thickness in meters.' },
          start: { type: 'array', items: { type: 'number' }, description: 'New start point [x, z] in meters.' },
          end: { type: 'array', items: { type: 'number' }, description: 'New end point [x, z] in meters.' },
          curveOffset: { type: 'number', description: 'Sagitta offset (meters) at the wall midpoint to bend the wall into an arc. Pass 0 (or omit) to keep straight.' },
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
      description: 'Remove a scene node by id. Most node types are removable; non-deletable types (e.g. scene root, building containers, internal sub-pieces like stair-segment) will return an explicit invalid result with errorReason — read the errorReason if a removal fails. Pass the container nodeId (e.g. the stair container, not stair-segment).',
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
          levelId: { type: 'string', description: 'Target level ID (from scene context). Required for multi-level buildings when targeting a level other than the currently selected one.' },
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
          levelId: { type: 'string', description: 'Target level ID (from scene context). Required for multi-level buildings when targeting a level other than the currently selected one.' },
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
          levelId: { type: 'string', description: 'Target level ID (from scene context). Required for multi-level buildings when targeting a level other than the currently selected one.' },
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
      name: 'add_elevator',
      description: 'Create a passenger elevator core attached to a building. The shaft spans levels [fromLevelId, toLevelId] (or servedLevelIds) and the system auto-cuts the slab/ceiling openings on every served floor — DO NOT call add_cut_out for the elevator shaft. Use add_stair when the user wants a visible stairway; use add_elevator for vertical transport that crosses three or more floors or whenever the user explicitly asks for an elevator / lift / 电梯 / エレベーター.',
      parameters: {
        type: 'object',
        properties: {
          position: { type: 'array', items: { type: 'number' }, description: 'Building-local shaft center [x, 0, z] in meters. Y is auto-resolved to the floor support so pass 0.' },
          rotationY: { type: 'number', description: 'Rotation around Y axis in radians (default: 0). 0 = elevator door faces +Z.' },
          width: { type: 'number', description: 'Cab width in meters (default: 1.6). Range: 0.6-4.0.' },
          depth: { type: 'number', description: 'Cab depth in meters (default: 1.6). Range: 0.6-4.0.' },
          cabHeight: { type: 'number', description: 'Cab interior height in meters (default: 2.35). Range: 2.0-4.0.' },
          fromLevelId: { type: 'string', description: 'Bottom-most served level ID. Defaults to the currently selected level.' },
          toLevelId: { type: 'string', description: 'Top-most served level ID. Defaults to the level immediately above fromLevelId.' },
          servedLevelIds: { type: 'array', items: { type: 'string' }, description: 'Optional explicit served-level list; used only when from/to are absent.' },
          shaftStyle: { type: 'string', enum: ['solid', 'glass'], description: 'Shaft shell presentation (default: solid). Use "glass" for a scenic / observation elevator.' },
          doorStyle: { type: 'string', enum: ['center-opening', 'single-left', 'single-right'], description: 'Door movement style (default: center-opening).' },
          doorPanelStyle: { type: 'string', enum: ['glass-frame', 'solid-panel', 'segmented-panel'], description: 'Door leaf visual style (default: glass-frame).' },
          buildingId: { type: 'string', description: 'Target building ID. Defaults to the building containing the active level.' },
          description: { type: 'string', description: 'Brief description of this elevator.' },
        },
        required: ['position'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_stair',
      description: 'Create a staircase. Default stairType="straight" creates one flight; "curved" uses innerRadius+sweepAngle; "spiral" uses innerRadius+sweepAngle plus optional integrated top landing. Set slabOpeningMode="destination" to auto-cut a hole in the destination level slab/ceiling for the stairwell.',
      parameters: {
        type: 'object',
        properties: {
          position: { type: 'array', items: { type: 'number' }, description: 'Position [x, y, z] in meters where the stair starts.' },
          rotationY: { type: 'number', description: 'Rotation around Y axis in radians (default: 0). 0 = stairs go toward +Z.' },
          width: { type: 'number', description: 'Stair width in meters (default: 1.0). Range: 0.5-5.0.' },
          length: { type: 'number', description: 'Horizontal run distance in meters (default: 3.0, straight stairs only). Range: 0.5-10.0.' },
          height: { type: 'number', description: 'Vertical rise in meters (default: 2.5). Should match floor-to-floor height. Range: 0.5-10.0.' },
          stepCount: { type: 'number', description: 'Number of steps (default: 10). Must be a whole number. Range: 2-30.' },
          stairType: { type: 'string', enum: ['straight', 'curved', 'spiral'], description: 'Stair geometry kind (default: straight).' },
          slabOpeningMode: { type: 'string', enum: ['none', 'destination'], description: 'Whether to auto-cut a slab/ceiling hole on the destination level (default: none).' },
          openingOffset: { type: 'number', description: 'Extra cutout polygon expansion in meters (default: 0).' },
          fillToFloor: { type: 'boolean', description: 'Whether the stair mass fills down to the floor (default: true). Set false for thin tread-only look.' },
          innerRadius: { type: 'number', description: 'Inner curve radius in meters for curved/spiral stairs (default: 0.9).' },
          sweepAngle: { type: 'number', description: 'Total sweep in radians for curved/spiral stairs (default: π/2).' },
          topLandingMode: { type: 'string', enum: ['none', 'integrated'], description: 'Optional integrated top landing for spiral stairs (default: none).' },
          topLandingDepth: { type: 'number', description: 'Depth of the integrated spiral top landing in meters (default: 0.9).' },
          showCenterColumn: { type: 'boolean', description: 'Render the spiral center column (default: true).' },
          showStepSupports: { type: 'boolean', description: 'Render step support brackets for spiral stairs (default: true).' },
          railingMode: { type: 'string', enum: ['none', 'left', 'right', 'both'], description: 'Where to render railings (default: none).' },
          railingHeight: { type: 'number', description: 'Railing top height above stair surface in meters (default: 0.92).' },
          fromLevelId: { type: 'string', description: 'Source level ID for auto cutout (defaults to the stair host level).' },
          toLevelId: { type: 'string', description: 'Destination level ID for auto cutout (defaults to the level immediately above).' },
          levelId: { type: 'string', description: 'Target level ID (from scene context). Required for multi-level buildings when targeting a level other than the currently selected one.' },
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
      description: 'Update properties of an existing staircase. Geometry-level fields apply to the StairNode container; width/length/height/stepCount/fillToFloor are also mirrored onto the first straight-stair segment.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'The node ID of the stair to update.' },
          position: { type: 'array', items: { type: 'number' }, description: 'New position [x, y, z] in meters.' },
          rotationY: { type: 'number', description: 'New rotation around Y axis in radians.' },
          width: { type: 'number', description: 'New stair width in meters (0.5-5.0).' },
          length: { type: 'number', description: 'New horizontal run in meters (0.5-10.0, straight stairs only).' },
          height: { type: 'number', description: 'New vertical rise in meters (0.5-10.0).' },
          stepCount: { type: 'number', description: 'New number of steps (2-30). Must be a whole number.' },
          stairType: { type: 'string', enum: ['straight', 'curved', 'spiral'], description: 'New stair geometry kind.' },
          slabOpeningMode: { type: 'string', enum: ['none', 'destination'], description: 'Toggle auto-cutout on destination level.' },
          openingOffset: { type: 'number', description: 'Adjust extra cutout expansion in meters.' },
          fillToFloor: { type: 'boolean', description: 'Toggle filled mass vs tread-only.' },
          innerRadius: { type: 'number', description: 'Inner radius for curved/spiral stairs.' },
          sweepAngle: { type: 'number', description: 'Total sweep in radians for curved/spiral stairs.' },
          topLandingMode: { type: 'string', enum: ['none', 'integrated'], description: 'Integrated spiral top landing toggle.' },
          topLandingDepth: { type: 'number', description: 'Spiral top landing depth in meters.' },
          showCenterColumn: { type: 'boolean', description: 'Spiral center column toggle.' },
          showStepSupports: { type: 'boolean', description: 'Spiral step support toggle.' },
          railingMode: { type: 'string', enum: ['none', 'left', 'right', 'both'], description: 'Railing rendering mode.' },
          railingHeight: { type: 'number', description: 'Railing top height in meters.' },
          fromLevelId: { type: 'string', description: 'Source level for auto cutout.' },
          toLevelId: { type: 'string', description: 'Destination level for auto cutout.' },
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
          levelId: { type: 'string', description: 'Target level ID (from scene context). Required for multi-level buildings when targeting a level other than the currently selected one.' },
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
      name: 'add_fence',
      description: 'Create a fence segment between two points. Fences are decorative/boundary elements with configurable style (slat, rail, privacy, horizontal).',
      parameters: {
        type: 'object',
        properties: {
          start: { type: 'array', items: { type: 'number' }, description: 'Start point [x, z] in meters.' },
          end: { type: 'array', items: { type: 'number' }, description: 'End point [x, z] in meters.' },
          height: { type: 'number', description: 'Fence height in meters (default: 1.8).' },
          thickness: { type: 'number', description: 'Fence panel thickness in meters (default: 0.08).' },
          style: { type: 'string', enum: ['slat', 'rail', 'privacy', 'horizontal'], description: 'Fence style (default: slat). slat = spaced vertical boards, rail = horizontal rails, privacy = solid panels, horizontal = horizontal-board cladding between end posts.' },
          baseStyle: { type: 'string', enum: ['floating', 'grounded'], description: 'Base style (default: grounded). grounded = sits on ground, floating = raised above ground.' },
          color: { type: 'string', description: 'Fence color as hex string (default: #ffffff).' },
          postSpacing: { type: 'number', description: 'Distance between fence posts in meters (default: 2).' },
          postCap: { type: 'string', enum: ['none', 'flat', 'pyramid'], description: 'Topper drawn on each fence post (default: pyramid). Pairs well with style="horizontal".' },
          slatGap: { type: 'number', description: 'For style="horizontal" only: reveal between boards in meters (default: 0.01). Set to 0 for flush cladding.' },
          curveOffset: { type: 'number', description: 'Optional sagitta offset (meters) at the fence midpoint to bend it into an arc. Omit for a straight fence.' },
          levelId: { type: 'string', description: 'Target level ID (from scene context). Required for multi-level buildings when targeting a level other than the currently selected one.' },
          description: { type: 'string', description: 'Brief description.' },
        },
        required: ['start', 'end'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_fence',
      description: 'Update properties of an existing fence (position, height, style, color, curveOffset, postCap, slatGap, etc.).',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'The node ID of the fence to update.' },
          start: { type: 'array', items: { type: 'number' }, description: 'New start point [x, z] in meters.' },
          end: { type: 'array', items: { type: 'number' }, description: 'New end point [x, z] in meters.' },
          height: { type: 'number', description: 'New fence height in meters.' },
          thickness: { type: 'number', description: 'New fence panel thickness in meters.' },
          style: { type: 'string', enum: ['slat', 'rail', 'privacy', 'horizontal'], description: 'New fence style. horizontal = horizontal-board cladding between end posts.' },
          baseStyle: { type: 'string', enum: ['floating', 'grounded'], description: 'New base style.' },
          color: { type: 'string', description: 'New fence color as hex string.' },
          postSpacing: { type: 'number', description: 'New post spacing in meters.' },
          postCap: { type: 'string', enum: ['none', 'flat', 'pyramid'], description: 'New post-cap style (none = no topper, flat = flat slab, pyramid = traditional pointed cap).' },
          slatGap: { type: 'number', description: 'For style="horizontal": new reveal between boards in meters (0 = flush).' },
          curveOffset: { type: 'number', description: 'New sagitta offset in meters (use 0 to straighten an arced fence).' },
          reason: { type: 'string', description: 'Brief reason for the change.' },
        },
        required: ['nodeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_cut_out',
      description: 'Add a hole (cut-out) to an existing slab or ceiling. The hole is defined as a polygon within the slab/ceiling boundary. Useful for stairwell openings, skylights, or HVAC vents.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'The node ID of the target slab or ceiling.' },
          hole: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: 'Hole polygon as array of [x, z] points in meters. Must be within the slab/ceiling boundary.' },
          description: { type: 'string', description: 'Brief description (e.g., "stairwell opening", "skylight").' },
        },
        required: ['nodeId', 'hole'],
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
                type: { type: 'string', enum: ['add_item', 'remove_item', 'move_item', 'update_material', 'update_item', 'add_wall', 'update_wall', 'update_wall_material', 'add_door', 'update_door', 'add_window', 'update_window', 'remove_node', 'add_level', 'add_slab', 'update_slab', 'add_ceiling', 'update_ceiling', 'add_roof', 'update_roof', 'update_roof_material', 'add_stair', 'update_stair', 'update_stair_material', 'add_elevator', 'add_zone', 'update_zone', 'add_building', 'update_site', 'add_scan', 'add_guide', 'move_building', 'clone_level', 'add_fence', 'update_fence', 'add_cut_out', 'add_roof_accessory', 'paint_slot', 'add_duct_segment', 'add_duct_fitting', 'add_duct_terminal', 'add_pipe_segment', 'add_pipe_fitting', 'add_pipe_trap', 'add_hvac_equipment', 'add_lineset', 'add_liquid_line', 'align_opening_to_nearest'] },
                catalogSlug: { type: 'string' }, nodeId: { type: 'string' },
                position: { type: 'array', items: { type: 'number' } }, rotationY: { type: 'number' },
                material: { type: 'string' },
                start: { type: 'array', items: { type: 'number' } }, end: { type: 'array', items: { type: 'number' } },
                thickness: { type: 'number' }, height: { type: 'number' },
                wallId: { type: 'string' }, levelId: { type: 'string' }, positionAlongWall: { type: 'number' }, heightFromFloor: { type: 'number' },
                width: { type: 'number' }, side: { type: 'string' }, hingesSide: { type: 'string' }, swingDirection: { type: 'string' },
                description: { type: 'string' }, reason: { type: 'string' },
                style: { type: 'string' }, baseStyle: { type: 'string' }, color: { type: 'string' }, postSpacing: { type: 'number' },
                hole: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
                // Curved wall/fence
                curveOffset: { type: 'number' },
                // Material role/preset/color (used by update_wall_material, update_roof_material, update_stair_material)
                role: { type: 'string' }, materialPreset: { type: 'string' }, materialColor: { type: 'string' },
                // Stair fields (add_stair, update_stair)
                length: { type: 'number' }, stepCount: { type: 'number' },
                stairType: { type: 'string' }, slabOpeningMode: { type: 'string' }, openingOffset: { type: 'number' },
                fillToFloor: { type: 'boolean' }, innerRadius: { type: 'number' }, sweepAngle: { type: 'number' },
                topLandingMode: { type: 'string' }, topLandingDepth: { type: 'number' },
                showCenterColumn: { type: 'boolean' }, showStepSupports: { type: 'boolean' },
                railingMode: { type: 'string' }, railingHeight: { type: 'number' },
                fromLevelId: { type: 'string' }, toLevelId: { type: 'string' },
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
          question: { type: 'string', description: "The question to ask the user, in the user's language." },
          options: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                label: { type: 'string', description: "Short option title shown to the user — MUST be in the user's language." },
                catalogSlug: { type: 'string' },
                position: { type: 'array', items: { type: 'number' } }, rotationY: { type: 'number' },
                reason: { type: 'string', description: "Why this placement works, shown to the user — MUST be in the user's language." },
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
  {
    type: 'function',
    function: {
      name: 'add_roof_accessory',
      description: 'Attach an accessory (chimney/dormer/skylight/solar-panel/ridge-vent/box-vent/turbine-vent/eyebrow-vent/cupola/gutter/downspout) onto an existing roof segment. Requires the parent roof to exist first — call add_roof before this if no roof is present. Point accessories are anchored to the pitched roof surface using segment-local 2D coordinates. kind="gutter" auto-snaps to the nearest eave (drip edge). kind="downspout" hangs off an existing gutter (requires gutterId — create the gutter first).',
      parameters: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['chimney', 'dormer', 'skylight', 'solar-panel', 'ridge-vent', 'box-vent', 'turbine-vent', 'eyebrow-vent', 'cupola', 'gutter', 'downspout'],
            description: 'Accessory kind. chimney=砖砌烟囱, dormer=老虎窗, skylight=天窗, solar-panel=太阳能光伏板, ridge-vent=屋脊通风器, box-vent=方形通风口, turbine-vent=涡轮通风器(whirlybird), eyebrow-vent=眉形通风口, cupola=屋顶塔楼(louvered roof lantern), gutter=檐沟(rain gutter), downspout=落水管.',
          },
          roofSegmentId: { type: 'string', description: 'Node ID of the parent roof-segment (look up "roof-segment" entries in scene context). REQUIRED for every kind except downspout. For kind="downspout" it may be omitted — the validator derives it from the host gutter automatically and ignores any value passed here.' },
          position: { type: 'array', items: { type: 'number' }, description: 'Segment-local position [x, y, z] in meters. Y is anchored to roof surface automatically. For kind="gutter" the position is snapped to the nearest eave (X/Z pick which eave side). Ignored for kind="downspout" (mount derives from the gutter outlet).' },
          rotation: { type: 'number', description: 'Rotation around Y axis in radians (default: 0). Overridden by the eave orientation for kind="gutter".' },
          width: { type: 'number', description: 'Width in meters. Defaults: chimney 0.6, dormer 2.0, skylight 1.0, solar-panel 1.0, ridge-vent 2.0, box-vent 0.6, eyebrow-vent 0.5, cupola 0.8. For turbine-vent this is the spinning head diameter (default 0.32).' },
          depth: { type: 'number', description: 'Depth in meters. Defaults: chimney 0.6, dormer 1.5, skylight 1.0, solar-panel 1.6, ridge-vent 0.3, box-vent 0.6, eyebrow-vent 0.6, cupola 0.8. Ignored for turbine-vent (radially symmetric).' },
          heightAboveRidge: { type: 'number', description: 'Chimney only: height above ridge in meters (default: 1.0). Ignored for other kinds.' },
          length: { type: 'number', description: 'Gutter only: run length along the eave in meters (default: 2.0). Downspout: optional vertical pipe length override (default: auto-computed from the eave height down to the segment base).' },
          gutterId: { type: 'string', description: 'Downspout only (REQUIRED for it): node ID of the host gutter this downspout drains. If no gutter exists, call add_roof_accessory kind="gutter" first.' },
          offsetAlongGutter: { type: 'number', description: 'Downspout only: outlet position along the gutter length, signed meters from the gutter center (default: 0). The outlet is drilled into the gutter automatically.' },
          description: { type: 'string', description: 'Brief description.' },
        },
        // roofSegmentId is intentionally NOT in `required`: kind="downspout"
        // derives it from the host gutter (validate-structure.ts downspout
        // branch never reads the call value). All other kinds still need it —
        // the validator rejects them with a clear errorReason when missing.
        required: ['kind', 'position'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_room_preset',
      description: 'Save an existing room (zone) as a reusable preset in the user\'s preset library. Use when the user says "save this room", "存为预设", "保存这个房间". The room is matched by name against the zones in the scene context. Saving is handled by the deployment backend — if presets are unavailable or the quota is full, relay the returned message to the user.',
      parameters: {
        type: 'object',
        properties: {
          roomName: { type: 'string', description: 'Room (zone) name to save, matched case-insensitively against zone names in the scene context (substring match allowed, e.g. "书房" matches "日式书房").' },
          levelName: { type: 'string', description: 'Optional level name or number to narrow the search when multiple levels contain similarly-named rooms (e.g. "2", "Second Floor", "二层").' },
        },
        required: ['roomName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'insert_room_preset',
      description: 'Insert one of the user\'s saved room presets into the scene. Use when the user says "insert my X preset", "放一个我的XX预设", "插入预设". The preset is matched by name against the saved-presets list in the context — if the name does not match, ask the user instead of guessing. Insertion is handled by the deployment backend; the created nodes are selected automatically and can be undone from the AI operation log.',
      parameters: {
        type: 'object',
        properties: {
          presetName: { type: 'string', description: 'Saved preset name, matched case-insensitively against the "User\'s saved room presets" list (substring match allowed).' },
          levelName: { type: 'string', description: 'Optional target level name or number (e.g. "2", "Second Floor"). Defaults to the currently active level.' },
          position: { type: 'array', items: { type: 'number' }, description: 'Optional floor-plane anchor [x, z] in meters for the inserted room. Defaults to [0, 0]. Pick an empty area that does not overlap existing rooms.' },
        },
        required: ['presetName'],
      },
    },
  },
  // ==========================================================================
  // MEP (mechanical/electrical/plumbing) node creation tools — Phase 2 §6.2.
  // Each add_* tool constructs one MEP node under the target level: HVAC
  // duct segments/fittings/terminals, DWV pipes/fittings/traps, HVAC cabinets,
  // and refrigerant linesets / liquid lines.
  // ==========================================================================
  {
    type: 'function',
    function: {
      name: 'add_duct_segment',
      description: 'Add an HVAC duct segment (polyline) to the current level. Draw supply/return runs as an array of [x,y,z] points in level-local meters (Y is height above the floor). Use crossSection="round" for branch runs (default 6") or crossSection="rect" for trunks (default 14×8"). Diameter/width/height are in inches (US nominal duct sizing).',
      parameters: {
        type: 'object',
        properties: {
          levelId: { type: 'string', description: 'Target level ID (from scene context). When omitted, uses the currently selected level.' },
          points: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: 'Polyline path — array of [x, y, z] points in level-local meters. Minimum 2 points.' },
          crossSection: { type: 'string', enum: ['round', 'rect'], description: 'Duct cross-section. round = branch (uses diameter); rect = trunk (uses width×height). Default round.' },
          diameter: { type: 'number', description: 'Round duct nominal inner diameter in inches (4-14 typical residential; range 2-48). Ignored for rect.' },
          width: { type: 'number', description: 'Rect duct horizontal face in inches (4-60). Ignored for round.' },
          height: { type: 'number', description: 'Rect duct vertical face in inches (3-40). Ignored for round.' },
          system: { type: 'string', enum: ['supply', 'return'], description: 'Which side of the air loop. Default supply.' },
          description: { type: 'string', description: 'Brief description.' },
        },
        required: ['points'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_duct_fitting',
      description: 'Add an HVAC duct junction (elbow, tee, reducer, cross, transition) at a level-local position. Rotation is an XYZ euler in radians. portSizes describes the collar diameters (in inches) — for reducer/transition pass both diameter (main/inlet) and diameter2 (secondary/outlet); for tee/cross diameter2 is the branch.',
      parameters: {
        type: 'object',
        properties: {
          levelId: { type: 'string', description: 'Target level ID. When omitted, uses the currently selected level.' },
          position: { type: 'array', items: { type: 'number' }, description: 'Level-local [x, y, z] position of the fitting body in meters.' },
          rotation: { type: 'array', items: { type: 'number' }, description: 'XYZ euler rotation in radians (default [0, 0, 0]).' },
          fittingType: { type: 'string', enum: ['elbow', 'tee', 'reducer', 'cap'], description: 'Junction kind. cap = round end-cap (mapped to a straight 0° elbow that closes the run). Use add_duct_fitting again with fittingType="tee" for a branch, "reducer" for a diameter change.' },
          portSizes: { type: 'object', description: 'Collar sizes in inches: { diameter?, diameter2? } where diameter = main/run/inlet and diameter2 = branch/reducer-outlet.', properties: { diameter: { type: 'number' }, diameter2: { type: 'number' } } },
        },
        required: ['position', 'fittingType'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_duct_terminal',
      description: 'Add an HVAC terminal (supply register / return grille / ceiling diffuser) mounted on a host surface. position is the level-local center of the visible face. terminalType="supply" → supply-register; "return" → return-grille; "diffuser" → ceiling diffuser (defaults to ceiling mount).',
      parameters: {
        type: 'object',
        properties: {
          levelId: { type: 'string', description: 'Target level ID. When omitted, uses the currently selected level.' },
          position: { type: 'array', items: { type: 'number' }, description: 'Level-local [x, y, z] center-of-face position in meters.' },
          hostId: { type: 'string', description: 'Optional host node ID (wall / ceiling / slab) whose surface the terminal mounts on. When present the mount type is derived from the host kind.' },
          terminalType: { type: 'string', enum: ['supply', 'return', 'diffuser'], description: 'Terminal role.' },
          rotation: { type: 'number', description: 'Yaw rotation in radians (default 0).' },
        },
        required: ['position', 'terminalType'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_pipe_segment',
      description: 'Add a DWV (drain/waste/vent) pipe segment as a polyline of level-local [x, y, z] points. pipeKind="dwv" is a waste run (sloped, Y may descend below the floor); "supply" and "gas" are provisional aliases mapped to a waste run (schema only exposes waste/vent today). diameter is nominal in inches (1.25-8).',
      parameters: {
        type: 'object',
        properties: {
          levelId: { type: 'string', description: 'Target level ID. When omitted, uses the currently selected level.' },
          points: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: 'Polyline path — array of [x, y, z] points in level-local meters. Minimum 2 points.' },
          diameter: { type: 'number', description: 'Nominal pipe size in inches. Residential DWV: 1.25 (lav tailpiece), 1.5, 2, 3, 4 (building drain).' },
          pipeKind: { type: 'string', enum: ['dwv', 'supply', 'gas'], description: 'Pipe role. dwv = waste drain (default), supply/gas map to a waste run today.' },
          description: { type: 'string', description: 'Brief description.' },
        },
        required: ['points'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_pipe_fitting',
      description: 'Add a DWV pipe fitting (elbow, tee, wye, reducer, cross) at a level-local position. fittingType="tee" maps to sanitary-tee; "reducer" maps to a 0° elbow that transitions diameters. rotation is XYZ euler radians.',
      parameters: {
        type: 'object',
        properties: {
          levelId: { type: 'string', description: 'Target level ID. When omitted, uses the currently selected level.' },
          position: { type: 'array', items: { type: 'number' }, description: 'Level-local [x, y, z] position of the fitting body in meters.' },
          rotation: { type: 'array', items: { type: 'number' }, description: 'XYZ euler rotation in radians (default [0, 0, 0]).' },
          fittingType: { type: 'string', enum: ['elbow', 'tee', 'wye', 'reducer'], description: 'Junction kind. tee → sanitary-tee (square branch); wye → 45° branch (code-preferred for horizontal drains); reducer → 0° elbow that steps diameter.' },
          diameter: { type: 'number', description: 'Run nominal size in inches (1.25-8). For reducer this is the inlet.' },
        },
        required: ['position', 'fittingType'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_pipe_trap',
      description: 'Add a DWV trap (P-trap or S-trap) at a level-local position. trapType="s-trap" is stored as a p-trap (the schema exposes only one trap kind) — the AI should still pass s-trap when the user explicitly asks for one so downstream logging is honest. rotation is yaw (radians).',
      parameters: {
        type: 'object',
        properties: {
          levelId: { type: 'string', description: 'Target level ID. When omitted, uses the currently selected level.' },
          position: { type: 'array', items: { type: 'number' }, description: 'Level-local [x, y, z] position in meters.' },
          rotation: { type: 'number', description: 'Yaw rotation in radians (trap-arm direction in plan). Default 0.' },
          diameter: { type: 'number', description: 'Trap size in inches (1.25-4). Should match the fixture drain.' },
          trapType: { type: 'string', enum: ['p-trap', 's-trap'], description: 'Trap kind. p-trap is code-compliant; s-trap is deprecated but accepted for legacy documentation.' },
        },
        required: ['position', 'diameter'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_hvac_equipment',
      description: 'Add an HVAC equipment cabinet (furnace, air handler, or outdoor condenser) at a level-local position. equipmentType="indoor-unit" maps to air-handler; "outdoor-unit" maps to condenser; "ahu" maps to air-handler. rotation is yaw (radians). Dimensions in meters.',
      parameters: {
        type: 'object',
        properties: {
          levelId: { type: 'string', description: 'Target level ID. When omitted, uses the currently selected level.' },
          position: { type: 'array', items: { type: 'number' }, description: 'Level-local [x, y, z] with Y at the cabinet base in meters.' },
          rotation: { type: 'number', description: 'Yaw rotation in radians (default 0).' },
          equipmentType: { type: 'string', enum: ['indoor-unit', 'outdoor-unit', 'ahu'], description: 'Cabinet role. indoor-unit / ahu → air-handler; outdoor-unit → condenser.' },
          width: { type: 'number', description: 'Cabinet width in meters (0.3-2, default 0.56).' },
          depth: { type: 'number', description: 'Cabinet depth in meters (0.3-2, default 0.71).' },
          height: { type: 'number', description: 'Cabinet height in meters (0.4-2.5, default 1.1).' },
        },
        required: ['position', 'equipmentType'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_lineset',
      description: 'Add a refrigerant lineset (copper suction + liquid pair) connecting an outdoor condenser to an indoor coil (air-handler or furnace). fromId and toId must both reference existing hvac-equipment nodes. route is an optional polyline of level-local [x, y, z] points; when omitted the validator wires a two-point straight run from the fromId cabinet to the toId cabinet.',
      parameters: {
        type: 'object',
        properties: {
          fromId: { type: 'string', description: 'Source hvac-equipment node ID (typically the outdoor condenser).' },
          toId: { type: 'string', description: 'Destination hvac-equipment node ID (typically the indoor air-handler / furnace).' },
          route: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: 'Optional [x, y, z] polyline path in level-local meters (min 2 points). When omitted, a straight run between the equipment positions is used.' },
        },
        required: ['fromId', 'toId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_liquid_line',
      description: 'Add a standalone refrigerant liquid line (thin bare copper) from fromId to toId. Same connection semantics as add_lineset but drawn as a single polyline — used to visualise the liquid line separately from the suction line.',
      parameters: {
        type: 'object',
        properties: {
          fromId: { type: 'string', description: 'Source hvac-equipment node ID.' },
          toId: { type: 'string', description: 'Destination hvac-equipment node ID.' },
          route: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: 'Optional [x, y, z] polyline path in level-local meters (min 2 points). Defaults to a straight run between fromId and toId.' },
        },
        required: ['fromId', 'toId'],
      },
    },
  },
  // ==========================================================================
  // Opening alignment tool — Phase 2 §6.4. Runs the opening-guides service to
  // find the nearest door/window along-wall (or vertical) sibling and snaps
  // the target opening onto that alignment feature.
  // ==========================================================================
  {
    type: 'function',
    function: {
      name: 'align_opening_to_nearest',
      description: 'Snap an existing door or window to its nearest alignment target on the same wall. Uses the shared opening-guides service (computeOpeningGuides) to detect the closest along-wall (center/edge) or vertical (sill/center/top) feature and rewrites the opening position to sit on it. axis="horizontal" snaps only along the wall; "vertical" snaps only in height; "both" applies whichever axes have a valid snap.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'Node ID of the door or window to align.' },
          axis: { type: 'string', enum: ['horizontal', 'vertical', 'both'], description: 'Which axis (or both) the snap should apply on. Default both.' },
        },
        required: ['nodeId'],
      },
    },
  },
]
