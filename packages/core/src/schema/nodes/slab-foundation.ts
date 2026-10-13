import { z } from 'zod'
import { MaterialSchema } from '../material'

export const SlabFoundation = z.object({
  type: z.enum(['solid', 'none']),
  material: z.union([z.string(), MaterialSchema]).optional(),
})
