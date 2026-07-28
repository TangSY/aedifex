type Placement = {
  RelativePlacement?: { value?: number }
  PlacementRelTo?: { value?: number }
}

export function collectPlacementChain({
  placementId,
  getPlacement,
}: {
  placementId: number
  getPlacement: (placementId: number) => Placement
}): number[] {
  const chain: number[] = []
  const visited = new Set<number>()
  let current: number | null = placementId

  while (current !== null) {
    if (visited.has(current)) break
    visited.add(current)

    const placement = getPlacement(current)
    const relativePlacementId = placement.RelativePlacement?.value
    if (relativePlacementId !== undefined) {
      chain.push(relativePlacementId)
    }
    current = placement.PlacementRelTo?.value ?? null
  }

  return chain
}
