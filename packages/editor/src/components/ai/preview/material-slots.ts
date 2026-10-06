import type { AnyNode } from '@aedifex/core'

export function buildMaterialSlotsPatch({
  node,
  slotIds,
  materialRef,
}: {
  node: AnyNode
  slotIds: readonly string[]
  materialRef: string
}): Partial<AnyNode> {
  const slots = { ...((node as { slots?: Record<string, string> }).slots ?? {}) }
  for (const slotId of slotIds) {
    if (materialRef) slots[slotId] = materialRef
    else delete slots[slotId]
  }
  return { slots } as Partial<AnyNode>
}
