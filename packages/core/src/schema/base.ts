import { customAlphabet } from 'nanoid'
import { z } from 'zod'
import { CameraSchema } from './camera'
import { Provenance } from './provenance'

const customId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 16)

/**
 * Material preset name reference
 * @example 'white', 'brick', 'wood', 'glass', 'preview-valid'
 */
export const Material = z.string().optional()
/** Mints the id of a new entity from its prefix: `wall` → `wall_…`. */
export type IdAllocator = (prefix: string) => string

const idAllocators: IdAllocator[] = []

/**
 * Runs `run` with `ids` minting every id it asks `generateId` (and so every schema default) for,
 * synchronously: a detached scene allocates deterministic ids this way (`effectIds`). Outside a
 * scope, ids are random.
 */
export function withIdAllocator<T>(ids: IdAllocator, run: () => T): T {
  idAllocators.push(ids)
  try {
    return run()
  } finally {
    idAllocators.pop()
  }
}

export const generateId = <T extends string>(prefix: T): `${T}_${string}` => {
  const allocate = idAllocators.at(-1)
  return (allocate ? allocate(prefix) : `${prefix}_${customId()}`) as `${T}_${string}`
}
export const objectId = <T extends string>(prefix: T) => {
  const schema = z.templateLiteral([`${prefix}_`, z.string()])

  return schema.default(() => generateId(prefix) as z.infer<typeof schema>)
}
export const nodeType = <T extends string>(type: T) => z.literal(type).default(type)

export const BaseNode = z.object({
  object: z.literal('node').default('node'),
  id: z.string(), // objectId('node'), @Aymericr: Thing is if we specify objectId here, when using BaseNode.extend, TS complains that the id is not assignable to the more specific type in the extended node
  type: nodeType('node'),
  name: z.string().optional(),
  parentId: z.string().nullable().default(null),
  visible: z.boolean().optional().default(true),
  camera: CameraSchema.optional(),
  // Existing saved scenes may contain any JSON metadata. Keep the common
  // object fast path without rejecting or rewriting those historical values.
  metadata: z.union([z.record(z.string(), z.unknown()), z.json()]).optional().default({}),
  provenance: Provenance.optional(),
})

export type BaseNode = z.infer<typeof BaseNode>
