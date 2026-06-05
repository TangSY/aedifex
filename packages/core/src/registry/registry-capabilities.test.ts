import { beforeEach, describe, expect, test } from 'bun:test'
import { z } from 'zod'
import {
  isRegistryMovable,
  isRegistrySelectable,
  kindsWithFloorplanScope,
  nodeRegistry,
  registerNode,
} from './registry'
import type { AnyNodeDefinition } from './types'

// Mirrors the helper in `registry.test.ts` — small factory that produces a
// minimum-viable definition shape suitable for `_register`. Tests override
// just the field they need to assert on (capabilities, floorplanScope, etc.).
function makeDefinition(
  kind: string,
  overrides: Partial<AnyNodeDefinition> = {},
): AnyNodeDefinition {
  return {
    kind,
    schemaVersion: 1,
    schema: z.object({ type: z.literal(kind) }) as any,
    category: 'utility',
    defaults: () => ({}) as any,
    capabilities: { deletable: false },
    renderer: { kind: 'parametric', module: async () => ({ default: () => null }) },
    ...overrides,
  }
}

describe('isRegistrySelectable', () => {
  beforeEach(() => {
    nodeRegistry._reset()
  })

  test('false for an unregistered kind', () => {
    // `nodeRegistry.get('whatever')` returns undefined; the optional chain
    // collapses to `undefined !== undefined` → false.
    expect(isRegistrySelectable('whatever')).toBe(false)
  })

  test('true when capabilities.selectable is declared (even an empty object)', () => {
    // Source: `def.capabilities.selectable !== undefined` — declares
    // selectable in any shape, including the empty `{}`.
    registerNode(
      makeDefinition('thingy', {
        capabilities: { selectable: {}, deletable: false },
      }),
    )
    expect(isRegistrySelectable('thingy')).toBe(true)
  })

  test('true with hitVolume configured', () => {
    registerNode(
      makeDefinition('hit-bbox', {
        capabilities: { selectable: { hitVolume: 'bbox' }, deletable: false },
      }),
    )
    expect(isRegistrySelectable('hit-bbox')).toBe(true)
  })

  test('false when selectable is omitted (no capability set)', () => {
    registerNode(makeDefinition('not-selectable'))
    expect(isRegistrySelectable('not-selectable')).toBe(false)
  })
})

describe('isRegistryMovable', () => {
  beforeEach(() => {
    nodeRegistry._reset()
  })

  test('false for unregistered kind', () => {
    // Source: `if (!def) return false` — early bail before any of the
    // three OR-branches fire.
    expect(isRegistryMovable('whatever')).toBe(false)
  })

  test('false when no movable / floorplanMoveTarget / affordanceTools.move declared', () => {
    registerNode(makeDefinition('inert'))
    expect(isRegistryMovable('inert')).toBe(false)
  })

  test('true when capabilities.movable is declared alone', () => {
    // First OR branch: `def.capabilities.movable !== undefined`.
    registerNode(
      makeDefinition('movable-only', {
        capabilities: {
          movable: { axes: ['x', 'z'] },
          deletable: false,
        },
      }),
    )
    expect(isRegistryMovable('movable-only')).toBe(true)
  })

  test('true when floorplanMoveTarget is declared alone', () => {
    // Second OR branch: `def.floorplanMoveTarget !== undefined`. We supply
    // a stub session factory — the helper only checks `!== undefined`.
    registerNode(
      makeDefinition('plan-move-only', {
        floorplanMoveTarget: (() => ({
          affectedIds: [],
          apply: () => {},
          canCommit: () => true,
        })) as any,
      }),
    )
    expect(isRegistryMovable('plan-move-only')).toBe(true)
  })

  test('true when affordanceTools.move is declared alone', () => {
    // Third OR branch: `def.affordanceTools?.move !== undefined`.
    registerNode(
      makeDefinition('affordance-move-only', {
        affordanceTools: {
          move: async () => ({ default: (() => null) as any }),
        },
      }),
    )
    expect(isRegistryMovable('affordance-move-only')).toBe(true)
  })

  test('false when affordanceTools exists but has no move entry', () => {
    // Same map, a different key (`curve`) → `affordanceTools.move` is
    // undefined, so the third OR branch is false.
    registerNode(
      makeDefinition('affordance-curve-only', {
        affordanceTools: {
          curve: async () => ({ default: (() => null) as any }),
        },
      }),
    )
    expect(isRegistryMovable('affordance-curve-only')).toBe(false)
  })
})

describe('kindsWithFloorplanScope', () => {
  beforeEach(() => {
    nodeRegistry._reset()
  })

  test('returns kinds whose floorplanScope === "building"', () => {
    // Only kinds explicitly tagged `building` show up — they're the ones
    // FloorplanRegistryLayer walks from the building level rather than
    // the active level.
    registerNode(
      makeDefinition('elevator', {
        floorplanScope: 'building',
      } as any),
    )
    registerNode(makeDefinition('wall'))
    expect(kindsWithFloorplanScope('building')).toEqual(['elevator'])
  })

  test('"level" is the default — kinds without floorplanScope are included', () => {
    // Source: `const declared = def.floorplanScope ?? 'level'` so an
    // undeclared kind defaults to 'level'.
    registerNode(makeDefinition('wall'))
    registerNode(makeDefinition('slab'))
    registerNode(
      makeDefinition('elevator', {
        floorplanScope: 'building',
      } as any),
    )
    const levelKinds = kindsWithFloorplanScope('level')
    expect(levelKinds).toContain('wall')
    expect(levelKinds).toContain('slab')
    expect(levelKinds).not.toContain('elevator')
  })

  test('empty result when scope matches nothing registered', () => {
    registerNode(makeDefinition('wall'))
    expect(kindsWithFloorplanScope('building')).toEqual([])
  })

  test('returns empty array when registry is empty', () => {
    expect(kindsWithFloorplanScope('level')).toEqual([])
    expect(kindsWithFloorplanScope('building')).toEqual([])
  })
})
