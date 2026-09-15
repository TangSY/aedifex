import { describe, expect, test } from 'bun:test'
import { collectPlacementChain } from '../src/placement-chain'

describe('collectPlacementChain', () => {
  test('stops at a PlacementRelTo cycle and preserves the accumulated chain', () => {
    const placements = new Map([
      [1, { RelativePlacement: { value: 101 }, PlacementRelTo: { value: 2 } }],
      [2, { RelativePlacement: { value: 102 }, PlacementRelTo: { value: 1 } }],
    ])
    const visited: number[] = []

    const chain = collectPlacementChain({
      placementId: 1,
      getPlacement: (placementId) => {
        visited.push(placementId)
        if (visited.length > placements.size) {
          throw new Error('placement traversal did not terminate')
        }
        const placement = placements.get(placementId)
        if (!placement) throw new Error(`missing placement ${placementId}`)
        return placement
      },
    })

    expect(chain).toEqual([101, 102])
    expect(visited).toEqual([1, 2])
  })

  test('walks an acyclic placement chain from leaf to root', () => {
    const placements = new Map([
      [1, { RelativePlacement: { value: 101 }, PlacementRelTo: { value: 2 } }],
      [2, { RelativePlacement: { value: 102 } }],
    ])

    expect(
      collectPlacementChain({
        placementId: 1,
        getPlacement: (placementId) => placements.get(placementId) ?? {},
      }),
    ).toEqual([101, 102])
  })
})
