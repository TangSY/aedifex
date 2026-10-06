import { z } from 'zod'
import { NodeId } from './node-id'
import { FloorFoundationPatch, ZoneIntentPatch } from './structure-patches'

export const setZoneIntentInput = { zoneId: NodeId, patch: ZoneIntentPatch }
export const divideZoneInput = {
  zoneId: NodeId,
  cut: z.tuple([z.tuple([z.number(), z.number()]), z.tuple([z.number(), z.number()])]).optional(),
  path: z
    .array(z.tuple([z.number(), z.number()]))
    .min(2)
    .optional(),
  closed: z.boolean().optional(),
  startBoundaryId: NodeId.optional(),
  endBoundaryId: NodeId.optional(),
}
export const mergeZonesInput = { zoneIds: z.tuple([NodeId, NodeId]) }
export const deleteZoneInput = { zoneId: NodeId, contents: z.enum(['delete', 'keep']) }
const point = z.tuple([z.number().finite(), z.number().finite()])
export const createMezzanineInput = {
  hostZoneId: NodeId,
  polygon: z.array(point).min(3),
  elevation: z.number().finite().optional(),
  thickness: z.number().finite().min(0.02).optional(),
}
export const cutFloorOpeningInput = {
  levelId: NodeId.optional(),
  zoneId: NodeId.optional(),
  levelIds: z.array(NodeId).min(1).optional(),
  polygon: z.array(point).min(3).optional(),
  rect: z
    .object({
      x: z.number().finite(),
      z: z.number().finite(),
      width: z.number().finite().positive(),
      depth: z.number().finite().positive(),
    })
    .optional(),
  drawnOn: z.enum(['floor', 'ceiling']).optional(),
  cutsPrimary: z.boolean().optional(),
  cutsAdjacent: z.boolean().optional(),
}
const rotate = z.object({ angle: z.number().finite(), pivot: point.optional() }).optional()
export const moveZoneInput = {
  zoneId: NodeId,
  translate: point.optional(),
  rotate,
  force: z.boolean().optional(),
}
export const duplicateZoneInput = { ...moveZoneInput, translate: point }
export const rotateZoneInput = {
  zoneId: NodeId,
  quarterTurns: z.union([z.literal(1), z.literal(-1)]),
  gridStep: z.number().finite().positive().optional(),
  force: z.boolean().optional(),
}
export const lockOutsideFacesInput = {
  levelId: NodeId.optional(),
  zoneIds: z.array(NodeId).min(1).optional(),
}
export const removeFloorOpeningInput = { id: NodeId }
export const setFloorFoundationInput = {
  slabId: NodeId.optional(),
  slabIds: z.array(NodeId).min(1).optional(),
  patch: FloorFoundationPatch,
}
export const setRoomFloorConstructionInput = {
  zoneId: NodeId,
  slabId: NodeId.optional(),
  patch: FloorFoundationPatch,
}
export const rebaseFloorReferenceInput = {
  slabId: NodeId.optional(),
  slabIds: z.array(NodeId).min(1).optional(),
  referenceFloorElevation: z.number().finite().nullable(),
}

export const cutFloorOpeningTool = {
  name: 'cut_floor_opening',
  title: 'Cut floor or ceiling opening',
  description:
    'Create a persistent opening on a room or level from a polygon or rectangle. A floor cut also opens the automatic ceiling directly below; a ceiling cut can also open the floor above. Use cutsAdjacent:false for a one-surface cut. A mezzanine room cuts only its own plate. levelIds repeats the opening as a shaft on several levels.',
  input: cutFloorOpeningInput,
  destructive: false,
} as const

export const removeFloorOpeningTool = {
  name: 'remove_floor_opening',
  title: 'Remove floor opening',
  description:
    'Remove an authored floor or ceiling opening and restore the derived surfaces it cut.',
  input: removeFloorOpeningInput,
  destructive: true,
} as const

export const setFloorFoundationTool = {
  name: 'set_floor_foundation',
  title: 'Set floor and foundation',
  description:
    'Supply slabId or slabIds; grouped plates receive the same floor-top displacement, while edge slots apply only to the first plate. A ground-contact floor has two inputs: thickness (slab, min 0.01 m, grows upward from the foundation) and foundationHeight (0 = on the ground, no foundation; > 0 = raised on a solid foundation; foundation.type "solid" alone raises it 0.3 m, "none" puts it on the ground). The floor top is derived and never floats: grade + foundationHeight + thickness; everything the floor carries (walls, openings, items, rooms, storeys above) moves with the top. Legacy floorHeight (a target top) maps to foundationHeight = top - grade - thickness, never below 0; null = on the ground. On upper plates the underside stays on the walls below: thickness (or floorHeight as a target top) changes the top; only ground-contact plates accept a foundation. Explicit room floors translate with the floor to preserve steps.',
  input: setFloorFoundationInput,
  destructive: false,
} as const

export const setRoomFloorConstructionTool = {
  name: 'set_room_floor_construction',
  title: 'Set room floor construction',
  description:
    'Edit the single floor volume associated with a room, with the same patch as set_floor_foundation. On a ground-contact floor: thickness (slab on the foundation, grows upward, min 0.01 m) and foundationHeight (0 = on the ground; > 0 = raised on a solid foundation); the top is derived as grade + foundationHeight + thickness and carries everything on the floor. A drawn slab takes thickness, finishes and a numeric floorHeight (its top) only. Supply slabId when the room spans multiple construction domains; an absorbed legacy slab is edited through its derived base plate.',
  input: setRoomFloorConstructionInput,
  destructive: false,
} as const

export const rebaseFloorReferenceTool = {
  name: 'rebase_floor_reference',
  title: 'Rebase floor reference',
  description:
    'Change or clear one or more footprint reference datums in one atomic edit, compensating supported storey offsets so existing world geometry stays in place. Supply slabIds together for a shared storey.',
  input: rebaseFloorReferenceInput,
  destructive: true,
} as const

export const createMezzanineTool = {
  name: 'create_mezzanine',
  title: 'Create mezzanine',
  description:
    'Add an open-below room inside a host reference polygon, with a separate thin plate and railings on open edges. Minimum area 1 m²; elevation defaults to half the storey snapped to 0.05 m, thickness to 0.2 m. Elevation must exceed thickness and stay at least 0.3 m below the resolved footprint plane; overlapping mezzanines are refused. The host floor and walls stay intact.',
  input: createMezzanineInput,
  destructive: false,
} as const

export const moveZoneTool = {
  name: 'move_zone',
  title: 'Move or rotate room',
  description:
    'Move room intent and contents. Shared walls and openings stay with neighbours; the room takes plain copies. Rotation is radians about Y, before translation, about the room centroid unless a pivot is supplied. Crossings split walls and overlaps re-derive rooms. Force can reposition obstructing openings when they fit; otherwise the edit is refused.',
  input: moveZoneInput,
  destructive: true,
} as const

export const duplicateZoneTool = {
  name: 'duplicate_zone',
  title: 'Duplicate room',
  description:
    'Copy room intent and contents with fresh IDs; shared walls are copied without openings. Rotation is radians about Y before translation. Collinear destination walls are merged, preserving their IDs and hosted children. Crossings split walls and rooms re-derive; overlap is allowed. Force can reposition obstructing openings only when they fit.',
  input: duplicateZoneInput,
  destructive: true,
} as const

export const rotateZoneTool = {
  name: 'rotate_zone',
  title: 'Rotate room a quarter turn',
  description:
    'Rotate a room by quarterTurns 1 or -1 about its centroid, then align its first reference vertex to gridStep (default 0.5 m). Crossings split walls and collinear overlaps merge. Force can reposition obstructing openings only when they fit.',
  input: rotateZoneInput,
  destructive: true,
} as const

export const lockOutsideFacesTool = {
  name: 'lock_outside_faces',
  title: 'Keep outside dimensions',
  description:
    "Keep the building's outer size: put exterior wall faces on their fixed reference lines, moving wall bodies inward so walls thicken inward and later thickness edits preserve outer dimensions. Supply either levelId or zoneIds.",
  input: lockOutsideFacesInput,
  destructive: true,
} as const

export const setZoneIntentTool = {
  name: 'set_zone_intent',
  title: 'Set room intent',
  description:
    'Update room name, floor finish/elevation/regions, floor.footprint ("new" mints a unique floor key tied to this creator room, an existing key joins that floor on this level, null returns to the shared floor). Touching rooms with the same key share a base plate; disconnected pieces share construction settings. Conversion preserves world geometry in one edit and refuses when infeasible. get_zones exposes floor_choices. A keyed floor uses "<creator room name> floor" while the creator remains on that key; otherwise it uses the largest named room. Existing keys such as "own" without a creator use that fallback. A user-given plate name wins; the shared floor stays "Shared floor". Keyed rooms can have raised or sunken floor.elevation, stored as a level-local walking top. Slab thickness, foundation height and edge finish use set_room_floor_construction, updating every piece of the key. Update ceiling paint regions (ceiling.regions: [x, z] polygons with a finish, later wins), step finishes (floorStepFinish for every step of the room; floorStepOverrides: [{ key, step?, finish }] per doorway, key = the door id the step sits under or the lower room id), wall material and construction opt-outs. Absent fields are unchanged; null clears.',
  input: setZoneIntentInput,
  destructive: false,
} as const

export const divideZoneTool = {
  name: 'divide_zone',
  title: 'Divide room',
  description:
    'Divide a room with an open path (endpoints snap to its boundary; the seed side keeps its id) or a closed island (outer room keeps its id). Supply path or the legacy two-point cut. Islands need 0.25 m² and 5 cm wall clearance.',
  input: divideZoneInput,
  destructive: true,
} as const

export const mergeZonesTool = {
  name: 'merge_zones',
  title: 'Merge rooms',
  description:
    'Remove shared separators between two rooms. Walls are preserved; wall-only boundaries return a conflict.',
  input: mergeZonesInput,
  destructive: true,
} as const

export const deleteZoneTool = {
  name: 'delete_zone',
  title: 'Delete room',
  description:
    'Delete a room. A room Divide made (a separator shared with a room on its outline) merges back into that room: the separators go, walls and items stay (mode "merge"). A room whose every boundary is a wall shared with other rooms is refused with a "shared-walls" conflict and nothing changes (mode "blocked"); delete one of its walls instead. Otherwise the room goes with its unshared walls, separators and their openings (mode "delete"), and contents chooses whether its items are kept or deleted. Returns the disposition payload.',
  input: deleteZoneInput,
  destructive: true,
} as const

export const STRUCTURE_TOOL_CONTRACTS = [
  cutFloorOpeningTool,
  removeFloorOpeningTool,
  setFloorFoundationTool,
  setRoomFloorConstructionTool,
  rebaseFloorReferenceTool,
  createMezzanineTool,
  moveZoneTool,
  duplicateZoneTool,
  rotateZoneTool,
  lockOutsideFacesTool,
  setZoneIntentTool,
  divideZoneTool,
  mergeZonesTool,
  deleteZoneTool,
] as const
