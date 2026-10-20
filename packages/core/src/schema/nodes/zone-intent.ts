import { z } from 'zod'
import { GeometryScriptSource } from '../geometry-source'
import { SurfacePaintRegion } from './surface-paint-region'

export const ZoneFloorScript = GeometryScriptSource.extend({ inputs: z.string() })
export type ZoneFloorScript = z.infer<typeof ZoneFloorScript>

export const ZoneFloorIntent = z.object({
  elevation: z.number().optional(),
  support: z.literal('open').optional(),
  footprint: z.string().min(1).optional(),
  thickness: z.number().min(0.02).optional(),
  sourceSlabId: z.templateLiteral(['slab_', z.string()]).optional(),
  finish: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
  regions: z.array(SurfacePaintRegion).optional(),
  script: ZoneFloorScript.optional(),
})

export const ZoneCeilingIntent = z.object({
  regions: z.array(SurfacePaintRegion).optional(),
})

export const ZoneFloorStepOverrides = z.array(
  z.object({
    key: z.string(),
    step: z.number().int().min(0).optional(),
    finish: z.string(),
  }),
)
