import { z } from 'zod'
import { SlabFoundation } from '../schema/nodes/slab-foundation'
import {
  ZoneCeilingIntent,
  ZoneFloorIntent,
  ZoneFloorStepOverrides,
} from '../schema/nodes/zone-intent'

export const FloorFoundationPatch = z.strictObject({
  thickness: z
    .number()
    .finite()
    .min(0)
    .optional()
    .describe(
      'Slab thickness in meters. On the ground it sits on the foundation (or the ground) and grows upward: a thicker slab raises the floor top and everything on it. Never below 0.01 m (smaller values are clamped). Upstairs the underside stays on the walls below.',
    ),
  foundationHeight: z
    .number()
    .finite()
    .min(0)
    .optional()
    .describe(
      'Ground-bearing floors only: height of the foundation under the slab, in meters. 0 = on the ground (no foundation); > 0 = raised on a solid foundation. The floor top is derived: grade + foundationHeight + thickness.',
    ),
  floorHeight: z
    .number()
    .finite()
    .nullable()
    .optional()
    .describe(
      'Legacy: a target floor top in level-local meters. On the ground it is mapped to foundationHeight = top - grade - thickness (never below 0); null = on the ground. Prefer thickness and foundationHeight.',
    ),
  foundation: SlabFoundation.optional(),
  slots: z
    .strictObject({
      edge: z.string().optional(),
      riser: z.string().optional(),
      underside: z.string().optional(),
    })
    .optional(),
})
export type FloorFoundationPatch = z.infer<typeof FloorFoundationPatch>

const floor = ZoneFloorIntent
const ceiling = ZoneCeilingIntent
export const ZoneIntentPatch = z.strictObject({
  name: z.string().nullable().optional(),
  floor: z
    .strictObject({
      footprint: floor.shape.footprint.unwrap().nullable().optional(),
      thickness: floor.shape.thickness.unwrap().nullable().optional(),
      elevation: floor.shape.elevation.unwrap().nullable().optional(),
      finish: floor.shape.finish.unwrap().nullable().optional(),
      regions: floor.shape.regions.unwrap().nullable().optional(),
    })
    .nullable()
    .optional(),
  ceiling: z
    .strictObject({
      regions: ceiling.shape.regions.unwrap().nullable().optional(),
    })
    .nullable()
    .optional(),
  floorStepFinish: z.string().nullable().optional(),
  floorStepOverrides: ZoneFloorStepOverrides.nullable().optional(),
  floorEdgeFinish: z.string().nullable().optional(),
  wallMaterial: z.string().nullable().optional(),
  hasFloor: z.boolean().nullable().optional(),
  hasCeiling: z.boolean().nullable().optional(),
})
export type ZoneIntentPatch = z.infer<typeof ZoneIntentPatch>
