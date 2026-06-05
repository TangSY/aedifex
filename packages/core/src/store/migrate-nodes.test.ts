import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { AnyNode, AnyNodeId } from '../schema/types'
import useScene, { clearSceneHistory } from './use-scene'

/**
 * migrate-nodes — exercise the backward-compat branches inside setScene.
 *
 * The migration function isn't exported, so we drive it via `setScene` and
 * inspect the resulting scene store. These tests pin the regressions that
 * already cost us once:
 *
 *   - Old (children-less) roof migration must set wallHeight=0.5, not 0.
 *     A zero-height roof wall produces a degenerate CSG brush that fails
 *     coplanar clipping and never renders ("invisible roof" bug).
 *   - shelf / roof-segment without a children[] array must end up with
 *     `children = []`, otherwise createNode(host, segmentId) parents the
 *     accessory in scene state but the renderer's recursive `<NodeRenderer>`
 *     never sees it ("orphaned host" bug).
 */

// bun:test has no DOM — node-actions schedules markDirty via rAF.
type RafFn = (cb: (t: number) => void) => number
;(globalThis as unknown as { requestAnimationFrame?: RafFn }).requestAnimationFrame ??= ((
  cb: (t: number) => void,
) => {
  cb(0)
  return 0
}) as RafFn
;(globalThis as unknown as { cancelAnimationFrame?: (id: number) => void }).cancelAnimationFrame ??=
  () => {}

const originalWarn = console.warn

beforeEach(() => {
  console.warn = mock(() => {}) as unknown as typeof console.warn
  useScene.setState({
    nodes: {},
    rootNodeIds: [],
    dirtyNodes: new Set<AnyNodeId>(),
    collections: {},
    readOnly: false,
  } as never)
  clearSceneHistory()
})

afterEach(() => {
  console.warn = originalWarn
})

// ── helpers ──────────────────────────────────────────────────────────

function makeSite(id = 'site_1' as AnyNodeId, children: AnyNodeId[] = []): AnyNode {
  return {
    id,
    type: 'site',
    parentId: null,
    object: 'node',
    visible: true,
    name: '',
    metadata: {},
    position: [0, 0, 0],
    rotation: 0,
    children,
  } as unknown as AnyNode
}

function makeBuilding(
  id = 'building_1' as AnyNodeId,
  parentId: AnyNodeId | null = 'site_1' as AnyNodeId,
  children: AnyNodeId[] = [],
): AnyNode {
  return {
    id,
    type: 'building',
    parentId,
    object: 'node',
    visible: true,
    name: '',
    metadata: {},
    position: [0, 0, 0],
    rotation: 0,
    children,
  } as unknown as AnyNode
}

function makeLevel(
  id = 'level_1' as AnyNodeId,
  parentId: AnyNodeId | null = 'building_1' as AnyNodeId,
  children: AnyNodeId[] = [],
): AnyNode {
  return {
    id,
    type: 'level',
    parentId,
    object: 'node',
    visible: true,
    name: '',
    metadata: {},
    position: [0, 0, 0],
    rotation: 0,
    level: 0,
    children,
  } as unknown as AnyNode
}

function setScene(nodes: AnyNode[], roots: AnyNodeId[] = ['site_1' as AnyNodeId]) {
  const dict: Record<AnyNodeId, AnyNode> = {}
  for (const n of nodes) dict[n.id as AnyNodeId] = n
  useScene.getState().setScene(dict, roots)
}

function getNode(id: string): AnyNode | undefined {
  return useScene.getState().nodes[id as AnyNodeId]
}

// ── tests ────────────────────────────────────────────────────────────

describe('migrateNodes — item.scale default', () => {
  test('legacy item without scale gets [1,1,1]', () => {
    const site = makeSite('site_1' as AnyNodeId, ['building_1' as AnyNodeId])
    const building = makeBuilding('building_1' as AnyNodeId, 'site_1' as AnyNodeId, [
      'level_1' as AnyNodeId,
    ])
    const level = makeLevel('level_1' as AnyNodeId, 'building_1' as AnyNodeId, [
      'item_legacy' as AnyNodeId,
    ])
    const legacyItem = {
      id: 'item_legacy',
      type: 'item',
      parentId: 'level_1',
      object: 'node',
      visible: true,
      metadata: {},
      position: [0, 0, 0],
      rotation: 0,
      // no `scale`
    } as unknown as AnyNode
    setScene([site, building, level, legacyItem])
    expect((getNode('item_legacy') as { scale?: unknown })?.scale).toEqual([1, 1, 1])
  })
})

describe('migrateNodes — old roof (no children) → roof + roof-segment', () => {
  test('synthesises a roof-segment with wallHeight = 0.5 (NOT 0)', () => {
    // Regression: wallHeight=0 produces a degenerate CSG brush
    // ("Coplanar clip not handled" + NaN geometry) so the migrated roof
    // never paints. New roofs use 0.5; the migration must match.
    const site = makeSite('site_1' as AnyNodeId, ['building_1' as AnyNodeId])
    const building = makeBuilding('building_1' as AnyNodeId, 'site_1' as AnyNodeId, [
      'level_1' as AnyNodeId,
    ])
    const level = makeLevel('level_1' as AnyNodeId, 'building_1' as AnyNodeId, [
      'roof_legacy' as AnyNodeId,
    ])
    const oldRoof = {
      id: 'roof_legacy',
      type: 'roof',
      parentId: 'level_1',
      object: 'node',
      visible: true,
      metadata: {},
      position: [0, 0, 0],
      rotation: 0,
      length: 8,
      leftWidth: 2.2,
      rightWidth: 2.2,
      height: 2.5,
      // no children → triggers the migration
    } as unknown as AnyNode
    setScene([site, building, level, oldRoof])

    // The migration writes a roof-segment alongside the roof. Find it.
    const all = Object.values(useScene.getState().nodes) as AnyNode[]
    const segment = all.find((n) => n.type === 'roof-segment') as
      | { wallHeight?: number; width?: number; depth?: number; pitch?: number; parentId?: string }
      | undefined
    expect(segment).toBeDefined()
    expect(segment?.wallHeight).toBe(0.5)
    expect(segment?.wallHeight).not.toBe(0) // explicit regression assertion
    expect(segment?.width).toBe(8)
    expect(segment?.depth).toBeCloseTo(4.4, 5)
    // Pitch derives from the legacy roofHeight (2.5m); must be > 0 so the
    // slope-frame guard doesn't collapse it to a flat slab.
    expect((segment?.pitch ?? 0) > 0).toBe(true)
    expect(segment?.parentId).toBe('roof_legacy')
  })

  test('original roof node gets its children[] populated with the new segment id', () => {
    const site = makeSite('site_1' as AnyNodeId, ['building_1' as AnyNodeId])
    const building = makeBuilding('building_1' as AnyNodeId, 'site_1' as AnyNodeId, [
      'level_1' as AnyNodeId,
    ])
    const level = makeLevel('level_1' as AnyNodeId, 'building_1' as AnyNodeId, [
      'roof_legacy' as AnyNodeId,
    ])
    const oldRoof = {
      id: 'roof_legacy',
      type: 'roof',
      parentId: 'level_1',
      object: 'node',
      visible: true,
      metadata: {},
      position: [0, 0, 0],
      rotation: 0,
      length: 6,
      leftWidth: 2,
      rightWidth: 2,
      height: 2,
    } as unknown as AnyNode
    setScene([site, building, level, oldRoof])
    const roof = getNode('roof_legacy') as { children?: string[] } | undefined
    expect(Array.isArray(roof?.children)).toBe(true)
    expect(roof?.children?.length).toBe(1)
    expect(roof?.children?.[0]).toMatch(/^rseg_/)
  })
})

describe('migrateNodes — roof-segment pitch fallback', () => {
  // Both pitch fallback (use-scene.ts:351-366) AND children-init branch
  // (use-scene.ts:404-407) now compose correctly: the children-init
  // branch reads from `patchedNodes[id] ?? node`, so when BOTH
  // `children[]` and `pitch` are missing, both fixes land in the same
  // final patched node. Tests pin the fixed behavior; a regression that
  // spreads `node` again would break both assertions below.

  test('pitch fallback survives even when children also need init (composed fixes)', () => {
    const site = makeSite('site_1' as AnyNodeId, ['building_1' as AnyNodeId])
    const building = makeBuilding('building_1' as AnyNodeId, 'site_1' as AnyNodeId, [
      'level_1' as AnyNodeId,
    ])
    const level = makeLevel('level_1' as AnyNodeId, 'building_1' as AnyNodeId, [
      'roof_host' as AnyNodeId,
    ])
    const roof = {
      id: 'roof_host',
      type: 'roof',
      parentId: 'level_1',
      object: 'node',
      visible: true,
      metadata: {},
      position: [0, 0, 0],
      rotation: 0,
      children: ['rseg_legacy'],
    } as unknown as AnyNode
    const seg = {
      id: 'rseg_legacy',
      type: 'roof-segment',
      parentId: 'roof_host',
      object: 'node',
      visible: true,
      metadata: {},
      position: [0, 0, 0],
      rotation: 0,
      roofType: 'gable',
      width: 8,
      depth: 6,
      wallHeight: 0.5,
      wallThickness: 0.1,
      deckThickness: 0.1,
      overhang: 0.3,
      shingleThickness: 0.05,
      // no pitch, no roofHeight, no children — exercises the bug path
    } as unknown as AnyNode
    setScene([site, building, level, roof, seg])
    const migrated = getNode('rseg_legacy') as { pitch?: number; children?: unknown[] } | undefined
    // Both fixes compose: children initialized AND pitch fallback preserved.
    expect(migrated?.children).toEqual([])
    expect(typeof migrated?.pitch).toBe('number')
    expect(migrated?.pitch).toBeGreaterThan(0)
  })

  test('pitch fallback survives when children[] already exists (no overwrite conflict)', () => {
    // Same scenario but with `children: []` already on the input — the
    // children-init branch is skipped, so the pitch fallback persists.
    const site = makeSite('site_1' as AnyNodeId, ['building_1' as AnyNodeId])
    const building = makeBuilding('building_1' as AnyNodeId, 'site_1' as AnyNodeId, [
      'level_1' as AnyNodeId,
    ])
    const level = makeLevel('level_1' as AnyNodeId, 'building_1' as AnyNodeId, [
      'roof_host' as AnyNodeId,
    ])
    const roof = {
      id: 'roof_host',
      type: 'roof',
      parentId: 'level_1',
      object: 'node',
      visible: true,
      metadata: {},
      position: [0, 0, 0],
      rotation: 0,
      children: ['rseg_with_height'],
    } as unknown as AnyNode
    const seg = {
      id: 'rseg_with_height',
      type: 'roof-segment',
      parentId: 'roof_host',
      object: 'node',
      visible: true,
      metadata: {},
      position: [0, 0, 0],
      rotation: 0,
      roofType: 'gable',
      width: 8,
      depth: 6,
      wallHeight: 0.5,
      wallThickness: 0.1,
      deckThickness: 0.1,
      overhang: 0.3,
      shingleThickness: 0.05,
      roofHeight: 2,
      children: [], // already present → bypasses the children-init branch
    } as unknown as AnyNode
    setScene([site, building, level, roof, seg])
    const migrated = getNode('rseg_with_height') as { pitch?: number; roofHeight?: unknown } | undefined
    expect((migrated?.pitch ?? 0) > 0).toBe(true)
    expect(migrated?.roofHeight).toBeUndefined()
  })

  test('roof-segment with a valid existing pitch is left untouched', () => {
    const site = makeSite('site_1' as AnyNodeId, ['building_1' as AnyNodeId])
    const building = makeBuilding('building_1' as AnyNodeId, 'site_1' as AnyNodeId, [
      'level_1' as AnyNodeId,
    ])
    const level = makeLevel('level_1' as AnyNodeId, 'building_1' as AnyNodeId, [
      'roof_host' as AnyNodeId,
    ])
    const roof = {
      id: 'roof_host',
      type: 'roof',
      parentId: 'level_1',
      object: 'node',
      visible: true,
      metadata: {},
      position: [0, 0, 0],
      rotation: 0,
      children: ['rseg_ok'],
    } as unknown as AnyNode
    const seg = {
      id: 'rseg_ok',
      type: 'roof-segment',
      parentId: 'roof_host',
      object: 'node',
      visible: true,
      metadata: {},
      position: [0, 0, 0],
      rotation: 0,
      roofType: 'gable',
      width: 8,
      depth: 6,
      wallHeight: 0.5,
      wallThickness: 0.1,
      deckThickness: 0.1,
      overhang: 0.3,
      shingleThickness: 0.05,
      pitch: 33,
      children: [],
    } as unknown as AnyNode
    setScene([site, building, level, roof, seg])
    expect((getNode('rseg_ok') as { pitch?: number }).pitch).toBe(33)
  })
})

describe('migrateNodes — shelf-v1 + roof-segment-v1 host children init', () => {
  test('shelf without children[] gets children = [] (orphaned-host bug regression)', () => {
    const site = makeSite('site_1' as AnyNodeId, ['building_1' as AnyNodeId])
    const building = makeBuilding('building_1' as AnyNodeId, 'site_1' as AnyNodeId, [
      'level_1' as AnyNodeId,
    ])
    const level = makeLevel('level_1' as AnyNodeId, 'building_1' as AnyNodeId, [
      'shelf_legacy' as AnyNodeId,
    ])
    const shelf = {
      id: 'shelf_legacy',
      type: 'shelf',
      parentId: 'level_1',
      object: 'node',
      visible: true,
      metadata: {},
      position: [0, 0, 0],
      rotation: 0,
      // no children
    } as unknown as AnyNode
    setScene([site, building, level, shelf])
    const migrated = getNode('shelf_legacy') as { children?: string[] } | undefined
    expect(Array.isArray(migrated?.children)).toBe(true)
    expect(migrated?.children).toEqual([])
  })

  test('roof-segment without children[] gets children = [] (mirror of shelf migration)', () => {
    const site = makeSite('site_1' as AnyNodeId, ['building_1' as AnyNodeId])
    const building = makeBuilding('building_1' as AnyNodeId, 'site_1' as AnyNodeId, [
      'level_1' as AnyNodeId,
    ])
    const level = makeLevel('level_1' as AnyNodeId, 'building_1' as AnyNodeId, [
      'roof_host' as AnyNodeId,
    ])
    const roof = {
      id: 'roof_host',
      type: 'roof',
      parentId: 'level_1',
      object: 'node',
      visible: true,
      metadata: {},
      position: [0, 0, 0],
      rotation: 0,
      children: ['rseg_v1'],
    } as unknown as AnyNode
    const seg = {
      id: 'rseg_v1',
      type: 'roof-segment',
      parentId: 'roof_host',
      object: 'node',
      visible: true,
      metadata: {},
      position: [0, 0, 0],
      rotation: 0,
      roofType: 'gable',
      width: 8,
      depth: 6,
      wallHeight: 0.5,
      wallThickness: 0.1,
      deckThickness: 0.1,
      overhang: 0.3,
      shingleThickness: 0.05,
      pitch: 40,
      // no children
    } as unknown as AnyNode
    setScene([site, building, level, roof, seg])
    const migrated = getNode('rseg_v1') as { children?: string[] } | undefined
    expect(Array.isArray(migrated?.children)).toBe(true)
    expect(migrated?.children).toEqual([])
  })

  test('shelf already with children is left untouched (idempotency)', () => {
    const site = makeSite('site_1' as AnyNodeId, ['building_1' as AnyNodeId])
    const building = makeBuilding('building_1' as AnyNodeId, 'site_1' as AnyNodeId, [
      'level_1' as AnyNodeId,
    ])
    const level = makeLevel('level_1' as AnyNodeId, 'building_1' as AnyNodeId, [
      'shelf_ok' as AnyNodeId,
    ])
    const item = {
      id: 'item_on_shelf',
      type: 'item',
      parentId: 'shelf_ok',
      object: 'node',
      visible: true,
      metadata: {},
      position: [0, 0, 0],
      rotation: 0,
      scale: [1, 1, 1],
    } as unknown as AnyNode
    const shelf = {
      id: 'shelf_ok',
      type: 'shelf',
      parentId: 'level_1',
      object: 'node',
      visible: true,
      metadata: {},
      position: [0, 0, 0],
      rotation: 0,
      children: ['item_on_shelf'],
    } as unknown as AnyNode
    setScene([site, building, level, shelf, item])
    expect((getNode('shelf_ok') as { children?: string[] })?.children).toEqual([
      'item_on_shelf',
    ])
  })
})
