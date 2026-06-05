import { describe, expect, test } from 'bun:test'
import { validateBuildJson } from '../validate-build-json'

/**
 * Round-2 coverage for `validateBuildJson` — the pre-flight checker for
 * `{ nodes, rootNodeIds }` build files. Focus: schema_failure branch,
 * stats accounting, unknown types, and orphan root behaviour.
 */
describe('validateBuildJson', () => {
  test('rejects non-object input with not_an_object', () => {
    const result = validateBuildJson('hello')
    expect(result.ok).toBe(false)
    expect(result.parsed).toBeNull()
    expect(result.errors.some((e) => e.code === 'not_an_object')).toBe(true)
  })

  test('flags missing nodes + rootNodeIds together', () => {
    const result = validateBuildJson({})
    expect(result.ok).toBe(false)
    const codes = result.errors.map((e) => e.code)
    expect(codes).toContain('missing_nodes')
    expect(codes).toContain('missing_root_node_ids')
  })

  test('schema_failure: known type wall but failing AnyNode.safeParse populates schemaIssues + fatal error', () => {
    // type === 'wall' (known) but missing required start/end tuples → AnyNode.safeParse fails.
    const result = validateBuildJson({
      nodes: {
        wall_bad: {
          object: 'node',
          id: 'wall_bad',
          type: 'wall',
          parentId: null,
        },
      },
      rootNodeIds: ['wall_bad'],
    })
    expect(result.ok).toBe(false)
    expect(result.schemaIssueCount).toBe(1)
    expect(result.schemaIssues.length).toBe(1)
    expect(result.schemaIssues[0]?.nodeId).toBe('wall_bad')
    expect(result.schemaIssues[0]?.nodeType).toBe('wall')
    expect(result.errors.some((e) => e.code === 'schema_failure')).toBe(true)
    // Even on schema_failure the type still counts in stats.byType.
    expect(result.stats.byType.wall).toBe(1)
  })

  test('unknown_types warning is emitted with names + counts', () => {
    const result = validateBuildJson({
      nodes: {
        a: { object: 'node', id: 'a', type: 'klingon-warship', parentId: null },
        b: { object: 'node', id: 'b', type: 'klingon-warship', parentId: null },
        c: { object: 'node', id: 'c', type: 'borg-cube', parentId: null },
      },
      rootNodeIds: ['a'],
    })
    expect(result.stats.unknownTypes['klingon-warship']).toBe(2)
    expect(result.stats.unknownTypes['borg-cube']).toBe(1)
    const w = result.warnings.find((w) => w.code === 'unknown_types')
    expect(w).toBeDefined()
    expect(w?.message).toContain('klingon-warship')
    expect(w?.message).toContain('borg-cube')
  })

  test('orphan_root warning when rootNodeIds reference missing nodes', () => {
    const result = validateBuildJson({
      nodes: {
        site_1: {
          object: 'node',
          id: 'site_1',
          type: 'site',
          parentId: null,
          children: [],
        },
      },
      rootNodeIds: ['site_1', 'ghost_node'],
    })
    expect(result.ok).toBe(true)
    expect(result.warnings.some((w) => w.code === 'orphan_root' && w.nodeId === 'ghost_node')).toBe(
      true,
    )
  })

  test('no_valid_roots is fatal when every root id is missing', () => {
    const result = validateBuildJson({
      nodes: {
        site_real: {
          object: 'node',
          id: 'site_real',
          type: 'site',
          parentId: null,
          children: [],
        },
      },
      rootNodeIds: ['phantom'],
    })
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.code === 'no_valid_roots')).toBe(true)
  })

  test('slab polygon area accumulates floorAreaM2 and subtracts holes', () => {
    // 4m x 4m slab = 16 m^2, hole 1m x 1m = 1 m^2 → 15 m^2.
    const result = validateBuildJson({
      nodes: {
        slab_1: {
          object: 'node',
          id: 'slab_1',
          type: 'slab',
          parentId: null,
          polygon: [
            [0, 0],
            [4, 0],
            [4, 4],
            [0, 4],
          ],
          holes: [
            [
              [1, 1],
              [2, 1],
              [2, 2],
              [1, 2],
            ],
          ],
        },
      },
      rootNodeIds: ['slab_1'],
    })
    // schema validation of slab may fail because we're not providing all fields,
    // but floor-area accounting is computed regardless of schema success.
    expect(result.stats.floorAreaM2).toBeCloseTo(15, 5)
  })

  test('key_id_mismatch warning aggregates count', () => {
    const result = validateBuildJson({
      nodes: {
        key_a: { object: 'node', id: 'actually_b', type: 'site', parentId: null, children: [] },
      },
      rootNodeIds: ['key_a'],
    })
    expect(result.warnings.some((w) => w.code === 'key_id_mismatch')).toBe(true)
  })
})
